<script lang="ts">
  import { t, plural } from "./lib/i18n.ts";
  import { isError, recSpan, spanIndexes, type MusicianIssue } from "../../server/musicians.ts";
  import { MAX_CONTROLS, type ControlMode, type Musician, type RackControl, type TrackSpan } from "../../server/protocol.ts";
  import { describeIssue } from "./lib/musician-issues.ts";
  import { sendChoices } from "./lib/sends.ts";
  import Segmented from "./Segmented.svelte";
  import Select, { type Choice } from "./Select.svelte";
  import SpanFields from "./SpanFields.svelte";
  import Switch from "./Switch.svelte";

  let {
    musician,
    locked,
    index,
    count,
    color,
    issues,
    trackNames,
    trackRacks,
    returns,
    recLengthFiles,
    chainMacro,
    onchange,
    onmove,
    onremove,
    onback,
  }: {
    musician: Musician;
    /** Concert mode: shown, not editable. */
    locked: boolean;
    index: number;
    /** How many musicians there are, to know which moves make sense. */
    count: number;
    color: string;
    issues: MusicianIssue[];
    trackNames: string[];
    /** Racks of each track, by track name. */
    trackRacks: Record<string, string[]>;
    /** Return track names of the set, in send order. */
    returns: string[];
    /** The record length files are read: the band and what ties the name to its file only exist then. */
    recLengthFiles: boolean;
    chainMacro: number;
    onchange: (musician: Musician) => void;
    onmove: (delta: number) => void;
    onremove: () => void;
    onback: () => void;
  } = $props();

  const menuId = $props.id();
  let menu: HTMLDivElement | undefined = $state();
  let isRenaming = $state(false);

  const update = (patch: Partial<Musician>) => onchange({ ...musician, ...patch });
  const errors = $derived(issues.filter(isError));
  const viewIndexes = $derived(spanIndexes(trackNames, musician.view));
  const viewTracks = $derived(viewIndexes ? trackNames.slice(viewIndexes.start, viewIndexes.end + 1) : []);
  const recTracks = $derived(recSpan(musician));
  const initials = $derived(musician.name.slice(0, 2).toUpperCase());

  const racksOf = (track: string): string[] => (Object.hasOwn(trackRacks, track) ? trackRacks[track] : []);
  const tracks: Choice[] = $derived(trackNames.map((name) => ({ value: name, label: name })));
  const tracksWith = (name: string): Choice[] =>
    trackNames.includes(name) ? tracks : [{ value: name, label: t("musician.trackNotFound", { name }) }, ...tracks];
  const racksWith = (control: RackControl): Choice[] => {
    const racks = racksOf(control.track);
    const choices = racks.map((name) => ({ value: name, label: name }));
    return racks.includes(control.rack) ? choices : [{ value: control.rack, label: t("musician.trackNotFound", { name: control.rack }) }, ...choices];
  };
  // The rack named like the track is the usual one ("ALEX 1" on ALEX 1), else the track's first rack.
  const defaultRack = (track: string) => {
    const racks = racksOf(track);
    return racks.includes(track) ? track : (racks[0] ?? track);
  };
  const MODES = $derived([
    { value: "chain", label: t("musician.modeChainActive") },
    { value: "rack", label: t("musician.modeRack") },
  ] as const);

  const controls = $derived(musician.controls ?? []);
  const setControls = (next: RackControl[]) => update({ controls: next.length > 0 ? next : undefined });
  const setControl = (ci: number, patch: Partial<RackControl>) =>
    setControls(controls.map((c, i) => (i === ci ? { ...c, ...patch } : c)));

  function addControl() {
    const used = new Set(controls.map((c) => c.track));
    const track = viewTracks.find((name) => !used.has(name) && racksOf(name).length > 0) ?? musician.view.first;
    setControls([...controls, { track, rack: defaultRack(track), mode: "chain" }]);
  }

  function setCueSend(send: string) {
    if (!send) update({ cue: null });
    else update({ cue: { send, span: musician.cue?.span ?? null } });
  }

  // Unticked, the fields start on the tab: a copy is only made once the cue really has its own tracks.
  const setCueFollows = (follows: boolean) =>
    musician.cue && update({ cue: { ...musician.cue, span: follows ? null : { first: musician.view.first, last: musician.view.last } } });

  const setRecMode = (mode: "auto" | "range") =>
    update({ rec: mode === "auto" ? undefined : { first: musician.view.first, last: musician.view.last } });

  function useSuggestion(issue: Extract<MusicianIssue, { kind: "missing_bound" }>, name: string) {
    const replace = <S extends TrackSpan>(span: S): S => ({ ...span, [issue.bound]: name });
    if (issue.target === "view") update({ view: replace(musician.view) });
    else if (issue.target === "cue" && musician.cue?.span) update({ cue: { ...musician.cue, span: replace(musician.cue.span) } });
    else if (issue.target === "rec" && musician.rec) update({ rec: replace(musician.rec) });
  }

  function act(action: () => void) {
    menu?.hidePopover();
    action();
  }

  function rename(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    isRenaming = false;
    const name = input.value.trim();
    if (name && name !== musician.name) update({ name });
  }
</script>

<nav class="top">
  <button type="button" class="back" onclick={onback}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>{t("musician.settings")}
  </button>
  <button type="button" class="round" aria-label={t("musician.moreOptions", { name: musician.name })} disabled={locked} popovertarget={menuId}>
    <svg viewBox="0 0 24 24" aria-hidden="true" class="dots"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
  </button>
  <div bind:this={menu} id={menuId} class="menu" popover="auto">
    <button type="button" onclick={() => act(() => (isRenaming = true))}>{t("musician.rename")}</button>
    <label class="menu-color">
      {t("musician.color")}
      <input type="color" value={color} oninput={(e) => update({ color: e.currentTarget.value })} />
    </label>
    {#if musician.color}
      <button type="button" onclick={() => act(() => update({ color: undefined }))}>{t("musician.colorDefault")}</button>
    {/if}
    <button type="button" disabled={index === 0} onclick={() => act(() => onmove(-1))}>{t("musician.moveUp")}</button>
    <button type="button" disabled={index === count - 1} onclick={() => act(() => onmove(1))}>{t("musician.moveDown")}</button>
    <button type="button" class="danger" onclick={() => act(onremove)}>{t("musician.remove")}</button>
  </div>
</nav>

<header class="head" style:--c={color}>
  <span class="badge" aria-hidden="true">{initials}</span>
  <div class="title">
    {#if isRenaming}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="name"
        aria-label={t("musician.nameField")}
        maxlength="40"
        value={musician.name}
        autofocus
        onblur={rename}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {#if recLengthFiles}
        <p class="rename-hint">
          {t("musician.renameHint", { name: musician.name })}
        </p>
      {/if}
    {:else}
      <h2>{musician.name}</h2>
      {#if recLengthFiles}<p class="sub">{t("musician.recFileSubtitle", { name: musician.name })}</p>{/if}
    {/if}
  </div>
</header>

<!-- Concert mode froze these on the server too: this only keeps the screen honest about it. -->
<fieldset class="cards" disabled={locked}>
  {#each errors as issue, ii (ii)}
    <p class="warning" role="alert">
      {describeIssue(issue, musician.name)}
      {#if issue.kind === "missing_bound" && issue.suggestion !== undefined}
        {@const suggestion = issue.suggestion}
        <button type="button" class="use" onclick={() => useSuggestion(issue, suggestion)}>{t("musician.useSuggestion", { suggestion })}</button>
      {/if}
    </p>
  {/each}

  <section class="card pad" style:--c={color}>
    <div class="card-head">
      <h3>{t("musician.tabTracks")}</h3>
      {#if viewTracks.length > 0}<span class="count">{plural("musician.tabTracksCount", viewTracks.length)}</span>{/if}
    </div>
    <SpanFields span={musician.view} label={t("musician.tabLabel", { name: musician.name })} {trackNames} onchange={(view) => update({ view: { ...musician.view, ...view } })} />
    {#if viewTracks.length > 0}
      <ul class="chips" aria-label={t("musician.tracksIncluded")}>
        {#each viewTracks as name, ti (ti)}<li>{name}</li>{/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <div class="pad-top">
      <h3>{t("musician.cue")}</h3>
      <p class="sub">{t("musician.cueHelp")}</p>
    </div>
    <div class="row stacked">
      <span class="label">{t("musician.cueReturn")}</span>
      <div>
        <Select label={t("musician.cueReturnLabel", { name: musician.name })} options={sendChoices(returns, t("common.none"), musician.cue?.send)} value={musician.cue?.send ?? ""} onchange={setCueSend} />
      </div>
    </div>
    {#if musician.cue}
      <div class="row">
        <span class="label">{t("musician.cueSameTracks")}</span>
        <Switch label={t("musician.cueSameTracksSwitch")} checked={musician.cue.span === null} onchange={setCueFollows} />
      </div>
      {#if musician.cue.span}
        {@const send = musician.cue.send}
        <div class="pad-bottom">
          <SpanFields span={musician.cue.span} label={t("musician.cueLabel", { name: musician.name })} {trackNames} onchange={(span) => update({ cue: { send, span } })} />
        </div>
      {/if}
    {/if}
  </section>

  {#if recLengthFiles}
  <section class="card pad">
    <h3>{t("musician.recBand")}</h3>
    <p class="sub">{t("musician.recBandHelp", { name: musician.name })}</p>
    <Segmented
      label={t("musician.recBandTracks")}
      value={musician.rec ? "range" : "auto"}
      options={[
        { value: "auto", label: t("musician.recBandModeAuto") },
        { value: "range", label: t("musician.recBandModeRange") },
      ]}
      onchange={setRecMode}
    />
    {#if musician.rec}
      <SpanFields span={musician.rec} label={t("musician.recBandLabel", { name: musician.name })} {trackNames} onchange={(rec) => update({ rec })} />
      <p class="sub">{t("musician.recBandTracksHelp")}</p>
    {:else}
      <p class="effective">{t("musician.recBandAbove")} <strong>{recTracks.first} → {recTracks.last}</strong> {t("musician.recBandAboveNote")}</p>
    {/if}
  </section>
  {/if}

  <section class="card">
    <div class="pad-top">
      <div class="card-head">
        <h3>{t("musician.macros")}</h3>
        <span class="sub">{t("musician.macrosRange")}</span>
      </div>
      <p class="sub">
        {t("musician.macrosHelp", { chainMacro })}
      </p>
    </div>
    {#each controls as control, ci (ci)}
      <div class="rack">
        <div class="rack-fields">
          <div class="pick">
            <span class="caption">{t("musician.rackTrack")}</span>
            <Select
              label={t("musician.rackTrackLabel", { index: ci + 1, name: musician.name })}
              options={tracksWith(control.track)}
              value={control.track}
              invalid={!trackNames.includes(control.track)}
              onchange={(track) => setControl(ci, { track, rack: defaultRack(track) })}
            />
          </div>
          <div class="pick">
            <span class="caption">{t("musician.rackName")}</span>
            <Select
              label={t("musician.rackNameLabel", { index: ci + 1, name: musician.name })}
              options={racksWith(control)}
              value={control.rack}
              invalid={!racksOf(control.track).includes(control.rack)}
              onchange={(rack) => setControl(ci, { rack })}
            />
          </div>
          <Segmented
            label={t("musician.rackMacrosLabel", { index: ci + 1, name: musician.name })}
            value={control.mode}
            options={MODES}
            onchange={(mode: ControlMode) => setControl(ci, { mode })}
          />
        </div>
        <button
          type="button"
          class="remove"
          aria-label={t("musician.removeRack", { rack: control.rack })}
          onclick={() => setControls(controls.filter((_, i) => i !== ci))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    {/each}
    <button type="button" class="add" disabled={controls.length >= MAX_CONTROLS || trackNames.length === 0} onclick={addControl}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t("musician.addRack")}
    </button>
  </section>
</fieldset>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
  }
  .back {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 44px;
    padding: 0 8px 0 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
  }
  .back svg,
  .add svg,
  .remove svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .dots {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .menu {
    position: fixed;
    inset: calc(64px + env(safe-area-inset-top)) 16px auto auto;
    min-width: 220px;
    margin: 0;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--surface-2);
    color: var(--text);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  }
  .menu:not(:popover-open) {
    display: none;
  }
  .menu button,
  .menu-color {
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }
  .menu button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .menu button:not(:disabled):hover,
  .menu-color:hover {
    background: var(--surface);
  }
  .menu-color input {
    width: 32px;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
  }
  .danger {
    color: var(--danger) !important;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 4px 18px;
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--c);
    font-size: 17px;
    font-weight: 700;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .name {
    box-sizing: border-box;
    width: 100%;
    height: 44px;
    padding: 0 10px;
    border: 1px solid var(--accent);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 20px;
    font-weight: 700;
  }
  .rename-hint {
    margin: 6px 0 0;
    color: var(--setting);
    font-size: 13px;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .cards:disabled {
    opacity: 0.4;
  }
  .card {
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
  }
  .pad {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  .pad-top {
    padding: 16px 16px 4px;
  }
  .pad-bottom {
    padding: 0 16px 16px;
  }
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .count {
    padding: 4px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 14%, transparent);
    color: var(--c);
    font-size: 12px;
    font-weight: 600;
  }
  .sub {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
  .pad .sub {
    margin: -10px 0 0;
  }
  .effective {
    margin: 0;
    font-size: 13px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    padding: 5px 8px;
    border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    font-size: 12px;
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 6px 16px;
  }
  .row.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 16px 14px;
  }
  .stacked :global(.trigger) {
    height: 44px;
    background: var(--bg);
  }
  .row + .row {
    border-top: 1px solid var(--border);
  }
  .label {
    flex: 1;
    font-size: 15px;
    font-weight: 500;
  }
  .rack {
    display: flex;
    gap: 6px;
    padding: 12px 6px 12px 16px;
    border-top: 1px solid var(--border);
  }
  .rack-fields {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 6px;
  }
  .rack-fields > :global(.segmented) {
    grid-column: 1 / -1;
  }
  .pick {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .caption {
    padding-left: 2px;
    color: var(--muted);
    font-size: 12px;
  }
  .pick :global(.trigger) {
    height: 44px;
    background: var(--bg);
  }
  .remove {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 44px;
    margin-top: 18px;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 52px;
    padding: 0 16px;
    border: 0;
    border-top: 1px solid var(--border);
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .add:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .warning {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--setting) 14%, transparent);
    color: var(--setting);
    font-size: 13px;
  }
  .use {
    display: block;
    margin-top: 6px;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    background: var(--setting);
    color: var(--on-setting);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
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
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
