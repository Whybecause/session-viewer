<script lang="ts">
  import { tick, untrack } from "svelte";
  import { musicianIssues } from "../../server/musicians.ts";
  import { DEFAULT_SETTINGS, type DisplaySettingsPatch, type Musician, type Settings } from "../../server/protocol.ts";
  import { t, plural } from "./lib/i18n.ts";
  import type { Diagnostic } from "./lib/diagnostics.ts";
  import { defaultView } from "./lib/family-view.ts";
  import { issuesOf } from "./lib/musician-issues.ts";
  import { myFamily, setMyFamily } from "./lib/my-family.svelte.ts";
  import { changeCount, draftError, holds, myNameAfterSave, settingsPatch, withRename, type SharedDraft } from "./lib/settings-draft.ts";
  import { connection, sendSettings, showNotice } from "./lib/session.svelte.ts";
  import ConnectSheet from "./ConnectSheet.svelte";
  import MusicianDetail from "./MusicianDetail.svelte";
  import SaveBar from "./SaveBar.svelte";
  import SettingsHome from "./SettingsHome.svelte";

  let {
    settings,
    sceneCount,
    trackNames,
    trackColors,
    checks,
    musicianColors,
    trackRacks,
    returns,
  }: {
    settings: Settings;
    sceneCount: number;
    trackNames: string[];
    trackColors: string[];
    /** What is out of step between Live, ClyphX and the settings. */
    checks: Diagnostic[];
    /** Colour each musician's tab shows, by name. */
    musicianColors: Record<string, string>;
    /** Racks of each track, by track name. */
    trackRacks: Record<string, string[]>;
    /** Return track names of the set, in send order. */
    returns: string[];
  } = $props();

  const FALLBACK_COLOR = "#8a8a8a";

  let dialog: HTMLDialogElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  // Mounted only while open: track lists per musician would be thousands of idle options.
  let isOpen = $state(false);
  let isConnecting = $state(false);
  /** null: the home page; else the index of the musician shown. */
  let page = $state<number | null>(null);
  // What the screen showed when opened or last saved: only fields edited since then are sent, so a save never reverts someone else's.
  let baseline = $state.raw<SharedDraft>(shared(DEFAULT_SETTINGS));
  let draft = $state.raw<SharedDraft>(shared(DEFAULT_SETTINGS));
  let error = $state("");
  let lockError = $state("");
  // Original name → current one: renaming yourself must not forget who "Je suis" is.
  let renamed = new Map<string, string>();
  /** A save sent and not yet confirmed. */
  let pending: { sent: DisplaySettingsPatch; renames: Map<string, string> } | null = null;

  const count = $derived(changeCount(baseline, draft));
  const racksOf = (name: string) => (Object.hasOwn(trackRacks, name) ? trackRacks[name] : undefined);
  const issues = $derived(musicianIssues(trackNames, draft.musicians, racksOf));
  const people = $derived(settings.musicians.map((m) => ({ name: m.name, color: musicianColors[m.name] ?? FALLBACK_COLOR })));
  const colorOf = (m: Musician) => m.color ?? trackColors[trackNames.indexOf(m.view.first)] ?? FALLBACK_COLOR;

  function shared({ startScene, hideScenesBefore, musicians, showArm, signalSend, recLengthFiles, chainMacro }: Settings): SharedDraft {
    return structuredClone($state.snapshot({ startScene, hideScenesBefore, musicians, showArm, signalSend, recLengthFiles, chainMacro }));
  }

  // A save only counts once the server sends the settings back: a refused one leaves the changes in the bar.
  // With nothing edited, someone else's save shows here too, rather than a stale screen that would undo it.
  $effect(() => {
    const next = settings;
    untrack(() => {
      if (pending && holds(shared(next), pending.sent)) settled(pending.renames, next);
      else if (!pending && count === 0) settled(new Map(), next);
    });
  });

  // Unsaved edits belong to the project they were made on: saving them on another would overwrite its musicians.
  let shownProject: string | null | undefined;
  $effect(() => {
    const project = connection.project;
    untrack(() => {
      const isMoved = shownProject !== undefined && project !== shownProject;
      shownProject = project;
      if (!isMoved || (count === 0 && !pending)) return;
      settled(new Map(), settings);
      showNotice(t("settings.projectChanged", { project: project ?? t("settings.globalSettings") }));
    });
  });

  // A refused save keeps its changes in the bar, to send again or cancel.
  $effect(() => {
    if (connection.notice) pending = null;
  });

  function settled(renames: ReadonlyMap<string, string>, saved: Settings) {
    setMyFamily(myNameAfterSave(myFamily.name, renames, saved.musicians.map((m) => m.name)));
    pending = null;
    renamed = new Map();
    baseline = shared(saved);
    draft = baseline;
  }

  export async function open(section?: "musicians" | "checks") {
    baseline = shared(settings);
    draft = baseline;
    renamed = new Map();
    pending = null;
    error = "";
    lockError = "";
    page = null;
    isOpen = true;
    await tick();
    dialog?.showModal();
    if (section) document.getElementById(section)?.scrollIntoView({ block: "start" });
  }

  async function go(next: number | null) {
    page = next;
    await tick();
    scroller?.scrollTo({ top: 0 });
  }

  function requestClose() {
    if (count > 0 && !confirm(plural("settings.unsavedChangesConfirm", count, { count }))) return;
    dialog?.close();
  }

  const edit = (patch: Partial<SharedDraft>) => {
    error = "";
    draft = { ...draft, ...patch };
  };
  const setMusicians = (musicians: Musician[]) => edit({ musicians });

  function updateMusician(index: number, next: Musician) {
    const previous = draft.musicians[index].name;
    if (next.name !== previous) renamed = withRename(renamed, previous, next.name);
    setMusicians(draft.musicians.map((m, i) => (i === index ? next : m)));
  }

  function moveMusician(index: number, delta: number) {
    const next = [...draft.musicians];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setMusicians(next);
    page = index + delta;
  }

  function removeMusician(index: number) {
    setMusicians(draft.musicians.filter((_, i) => i !== index));
    void go(null);
  }

  function addMusician() {
    const taken = new Set(draft.musicians.map((m) => m.name));
    let number = 1;
    while (taken.has(`Musicien ${number}`)) number += 1;
    setMusicians([...draft.musicians, { name: `Musicien ${number}`, view: defaultView(trackNames, 0), cue: null }]);
    void go(draft.musicians.length - 1);
  }

  function lock(locked: boolean) {
    lockError = sendSettings({ locked }) ? "" : t("common.serverUnreachable");
  }

  function save() {
    const invalid = draftError(draft, sceneCount);
    if (invalid) {
      error = invalid;
      return;
    }
    const next = { ...draft, musicians: draft.musicians.map((m) => ({ ...m, name: m.name.trim() })) };
    // Only fields edited here, so a save never reverts someone else's; minus those the server already holds, as an
    // unchanged server sends nothing back and the bar would wait for it.
    const differsFromServer = settingsPatch(shared(settings), next);
    const patch = Object.fromEntries(Object.entries(settingsPatch(baseline, next)).filter(([key]) => key in differsFromServer));
    if (Object.keys(patch).length === 0) {
      settled(renamed, settings);
      return;
    }
    if (!sendSettings(patch)) {
      error = t("common.serverUnreachable");
      return;
    }
    draft = next;
    pending = { sent: patch, renames: renamed };
  }

  function cancel() {
    draft = baseline;
    renamed = new Map();
    pending = null;
    error = "";
    if (page !== null && page >= draft.musicians.length) void go(null);
  }
</script>

<button type="button" class="open" aria-label={t("settings.settingsTitle")} onclick={() => open()}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.5a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.3 2.5h4l.3-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6Z"
    />
  </svg>
</button>

{#if isOpen}
  <dialog
    bind:this={dialog}
    class="screen"
    aria-labelledby="settings-title"
    onclose={() => (isOpen = false)}
    onclick={(event) => event.target === dialog && requestClose()}
    oncancel={(e) => {
      e.preventDefault();
      requestClose();
    }}
  >
    <div class="scroller" bind:this={scroller}>
      {#if page === null || !draft.musicians[page]}
        <header>
          <h1 id="settings-title">{t("settings.settingsTitle")}</h1>
          <button type="button" class="round" aria-label={t("common.close")} onclick={requestClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="home">
          <SettingsHome
            {draft}
            locked={settings.locked}
            {lockError}
            {people}
            {sceneCount}
            {trackNames}
            {returns}
            {checks}
            {issues}
            {colorOf}
            networkCount={connection.serverUrls.length}
            project={connection.project}
            onchange={edit}
            onlock={lock}
            onopen={(i) => go(i)}
            onadd={addMusician}
            onconnect={() => (isConnecting = true)}
          />
        </div>
      {:else}
        {@const index = page}
        {@const musician = draft.musicians[index]}
        <h1 id="settings-title" class="visually-hidden">{t("settings.settingsTitle")} · {musician.name}</h1>
        <div class="detail">
          <MusicianDetail
            {musician}
            locked={settings.locked}
            {index}
            count={draft.musicians.length}
            color={colorOf(musician)}
            issues={issuesOf(issues, musician.name)}
            {trackNames}
            {trackRacks}
            {returns}
            recLengthFiles={draft.recLengthFiles}
            chainMacro={draft.chainMacro}
            onchange={(next) => updateMusician(index, next)}
            onmove={(delta) => moveMusician(index, delta)}
            onremove={() => removeMusician(index)}
            onback={() => go(null)}
          />
        </div>
      {/if}
      {#if connection.notice}
        <p class="error" role="alert">{connection.notice}</p>
      {/if}
      {#if count > 0 && !settings.locked}
        <SaveBar {count} {error} onsave={save} oncancel={cancel} />
      {/if}
    </div>
    {#if isConnecting}<ConnectSheet onClose={() => (isConnecting = false)} />{/if}
  </dialog>
{/if}

<style>
  .open {
    margin-left: auto;
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .open svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .open:active {
    background: var(--surface-2);
  }
  .open:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .screen {
    box-sizing: border-box;
    width: 100%;
    max-width: 560px;
    height: 100dvh;
    max-height: none;
    margin: 0 auto;
    padding: 0;
    border: 0;
    background: var(--bg);
    color: var(--text);
  }
  .screen::backdrop {
    background: var(--bg);
  }
  @media (min-width: 640px) {
    .screen {
      height: calc(100dvh - 48px);
      margin: auto;
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 24px 60px rgb(0 0 0 / 0.5);
    }
    .screen::backdrop {
      background: rgb(0 0 0 / 0.55);
      backdrop-filter: blur(2px);
    }
  }
  .scroller {
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: env(safe-area-inset-top) 16px max(24px, env(safe-area-inset-bottom));
  }
  @media (min-width: 640px) {
    .scroller {
      padding-top: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 4px 12px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .home {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-top: 4px;
  }
  .detail {
    padding-top: 10px;
  }
  .round {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .round svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .round:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .error {
    margin: 16px 4px 0;
    color: var(--setting);
    font-size: 14px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
