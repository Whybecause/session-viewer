<script lang="ts">
  import { isError, spanIndexes, type MusicianIssue } from "../../server/musicians.ts";
  import { MAX_MACRO, MAX_MUSICIANS, type Musician } from "../../server/protocol.ts";
  import { t, plural } from "./lib/i18n.ts";
  import { describeDiagnostic, type Diagnostic } from "./lib/diagnostics.ts";
  import { describeIssue, issuesOf } from "./lib/musician-issues.ts";
  import { myFamily, setMyFamily } from "./lib/my-family.svelte.ts";
  import { recBar, setRecBarShown } from "./lib/rec-bar.svelte.ts";
  import type { SharedDraft } from "./lib/settings-draft.ts";
  import { sendChoices } from "./lib/sends.ts";
  import { trackSplit } from "./lib/track-split.ts";
  import Segmented from "./Segmented.svelte";
  import Select from "./Select.svelte";
  import Switch from "./Switch.svelte";

  let {
    draft,
    locked,
    lockError,
    people,
    sceneCount,
    trackNames,
    returns,
    checks,
    issues,
    colorOf,
    networkCount,
    onchange,
    onlock,
    onopen,
    onadd,
    onconnect,
  }: {
    draft: SharedDraft;
    locked: boolean;
    /** Why switching concert mode did not go through; "" when it did. */
    lockError: string;
    /** The saved musicians, for "Je suis": a phone follows a name the server knows. */
    people: { name: string; color: string }[];
    sceneCount: number;
    trackNames: string[];
    returns: string[];
    /** What is out of step between Live, ClyphX and the settings. */
    checks: Diagnostic[];
    issues: MusicianIssue[];
    colorOf: (musician: Musician) => string;
    networkCount: number;
    onchange: (patch: Partial<SharedDraft>) => void;
    onlock: (locked: boolean) => void;
    onopen: (index: number) => void;
    onadd: () => void;
    onconnect: () => void;
  } = $props();

  const NAMES_IN_NOTE = 3;
  const macroChoices = Array.from({ length: MAX_MACRO }, (_, i) => ({ value: String(i + 1), label: `Macro ${i + 1}` }));

  let isUnassignedOpen = $state(false);

  const split = $derived(trackSplit(trackNames, draft.musicians));
  const unassigned = $derived(issues.flatMap((i) => (i.kind === "unassigned" ? i.tracks : [])));
  const signalChoices = $derived(sendChoices(returns, t("common.none"), draft.signalSend ?? ""));
  const me = $derived(people.some((p) => p.name === myFamily.name) ? (myFamily.name as string) : "");
  const meOptions = $derived([{ value: "", label: t("common.none") }, ...people.map((p) => ({ value: p.name, label: p.name, dot: p.color }))]);

  const stepScene = (delta: number) => onchange({ startScene: Math.min(Math.max(draft.startScene + delta, 1), sceneCount) });

  function summary(m: Musician): string {
    const found = spanIndexes(trackNames, m.view);
    const racks = m.controls?.length ?? 0;
    return [
      `${m.view.first} → ${m.view.last}`,
      ...(found ? [plural("settings.trackCount", found.end - found.start + 1)] : []),
      racks > 0 ? plural("settings.rackCount", racks) : t("settings.noRacks"),
    ].join(" · ");
  }
</script>

<section class="concert" class:on={locked}>
  <span class="concert-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  </span>
  <div class="grow">
    <div class="concert-title">{t("settings.concertMode")}</div>
    <div class="sub">{locked ? t("settings.concertModeOn") : t("settings.concertModeOff")}</div>
    {#if lockError}<div class="lock-error" role="alert">{lockError}</div>{/if}
  </div>
  <Switch label={t("settings.concertMode")} checked={locked} onchange={onlock} />
</section>

{#if checks.length > 0}
  <section id="checks" aria-labelledby="checks-title">
    <h3 id="checks-title" class="section-title">{t("settings.checkTitle")}</h3>
    <div class="card checks">
      {#each checks as check, i (i)}<p class="check">{describeDiagnostic(check)}</p>{/each}
    </div>
  </section>
{/if}

<section aria-labelledby="device-title">
  <div class="section-head">
    <h3 id="device-title" class="section-title">{t("settings.deviceSection")}</h3>
    <span class="aside">{t("settings.appliedImmediately")}</span>
  </div>
  <div class="card">
    <div class="block">
      <div class="label">{t("settings.aboutMe")}</div>
      <div class="sub">{t("settings.aboutMeHint")}</div>
      <Segmented label={t("settings.aboutMe")} wrap value={me} options={meOptions} onchange={(name) => setMyFamily(name || null)} />
    </div>
    <div class="row">
      <span class="label">{t("settings.recBarLabel")}</span>
      <Switch label={t("settings.recBarLabel")} checked={recBar.shown} onchange={setRecBarShown} />
    </div>
  </div>
</section>

<!-- Concert mode froze these on the server too: this only keeps the screen honest about it. -->
<fieldset class="shared" disabled={locked}>
  <section aria-labelledby="group-title">
    <div class="section-head">
      <h3 id="group-title" class="section-title">{t("settings.groupDisplay")}</h3>
      <span class="aside">{t("settings.forEveryone")}</span>
    </div>
    <div class="card">
      <div class="row">
        <span class="label" id="scene-label">{t("settings.startScene")}</span>
        <div class="stepper" role="group" aria-labelledby="scene-label">
          <button type="button" aria-label={t("settings.previousScene")} onclick={() => stepScene(-1)}>−</button>
          <span class="scene" aria-live="polite">{draft.startScene}</span>
          <button type="button" aria-label={t("settings.nextScene")} onclick={() => stepScene(1)}>+</button>
        </div>
      </div>
      <div class="row">
        <span class="label">{t("settings.hideScenesBefore")}</span>
        <Switch label={t("settings.hideScenesBefore")} checked={draft.hideScenesBefore} onchange={(hideScenesBefore) => onchange({ hideScenesBefore })} />
      </div>
      <div class="row">
        <span class="grow">
          <span class="label">{t("settings.armIndicator")}</span>
          <span class="sub arm"><span class="arm-dot" aria-hidden="true"></span>{t("settings.armIndicatorHint")}</span>
        </span>
        <Switch label={t("settings.armIndicator")} checked={draft.showArm} onchange={(showArm) => onchange({ showArm })} />
      </div>
      <div class="block">
        <span class="label">{t("settings.foldedCorner")}</span>
        <Select
          label={t("settings.foldedCorner")}
          options={signalChoices}
          value={draft.signalSend ?? ""}
          onchange={(send) => onchange({ signalSend: send || null })}
        />
      </div>
      <div class="row">
        <span class="grow">
          <span class="label">{t("settings.recordLengths")}</span>
          <span class="sub">{t("settings.recordLengthsHint")}</span>
        </span>
        <Switch label={t("settings.recordLengths")} checked={draft.recLengthFiles} onchange={(recLengthFiles) => onchange({ recLengthFiles })} />
      </div>
      <div class="block">
        <span class="label">{t("settings.chainMacro")}</span>
        <span class="sub">{t("settings.chainMacroHint")}</span>
        <Select
          label={t("settings.chainMacro")}
          options={macroChoices}
          value={String(draft.chainMacro)}
          onchange={(macro) => onchange({ chainMacro: Number(macro) })}
        />
      </div>
    </div>
  </section>

  <section id="musicians" aria-labelledby="musicians-title">
    <div class="section-head">
      <h3 id="musicians-title" class="section-title">{t("settings.musiciansSection")}</h3>
      <span class="aside">{plural("settings.tracksInSet", trackNames.length)}</span>
    </div>
    <div class="card">
      {#if draft.musicians.length > 0 && trackNames.length > 0}
        {@const legend = [
          ...draft.musicians.map((m, i) => ({ name: m.name, count: split.counts[i], color: colorOf(m) })),
          { name: t("settings.unassignedTracks"), count: split.free, color: null },
        ]}
        <div class="block">
          <div class="split" role="img" aria-label={t("settings.trackDistribution", { legend: legend.map((l) => `${l.name} ${l.count}`).join(', ') })}>
            {#each legend as part, pi (pi)}
              {#if part.count > 0}<span class:free={part.color === null} style:flex-grow={part.count} style:background={part.color}></span>{/if}
            {/each}
          </div>
          <div class="legend" aria-hidden="true">
            {#each legend as part, pi (pi)}
              <span><span class="swatch" class:free={part.color === null} style:background={part.color}></span>{part.name} {part.count}</span>
            {/each}
          </div>
        </div>
      {/if}
      {#each draft.musicians as musician, i (i)}
        {@const errors = issuesOf(issues, musician.name).filter(isError)}
        <button type="button" class="musician" style:--c={colorOf(musician)} onclick={() => onopen(i)}>
          <span class="badge" aria-hidden="true">{musician.name.slice(0, 2).toUpperCase()}</span>
          <span class="grow">
            <span class="musician-name">{musician.name}</span>
            <span class="sub">{summary(musician)}</span>
            {#if errors.length > 0}
              <span class="warn">
                {describeIssue(errors[0], musician.name)}{errors.length > 1 ? ` (+${errors.length - 1})` : ""}
              </span>
            {/if}
          </span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      {/each}
      <button type="button" class="add" disabled={draft.musicians.length >= MAX_MUSICIANS || trackNames.length === 0} onclick={onadd}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t("settings.addMusician")}
      </button>
    </div>
    {#if unassigned.length > 0}
      <button type="button" class="note" aria-expanded={isUnassignedOpen} onclick={() => (isUnassignedOpen = !isUnassignedOpen)}>
        <span class="grow">
          {plural("settings.unassignedTracksNote", unassigned.length, { names: unassigned.slice(0, NAMES_IN_NOTE).join(", ") + (unassigned.length > NAMES_IN_NOTE ? "…" : ""), action: isUnassignedOpen ? t("settings.hideUnassigned") : t("settings.showUnassigned") })}
        </span>
      </button>
      {#if isUnassignedOpen}
        <p class="unassigned">{unassigned.join(", ")}</p>
      {/if}
    {/if}
  </section>
</fieldset>

<section aria-labelledby="phones-title">
  <h3 id="phones-title" class="section-title">{t("settings.otherPhones")}</h3>
  <button type="button" class="card connect" onclick={onconnect}>
    <span class="connect-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"
        ><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path
          d="M14 14h3v3M21 14v.01M14 21h7v-4"
        /></svg
      >
    </span>
    <span class="grow">
      <span class="label">{t("settings.connectPhone")}</span>
      <span class="sub">{t("settings.connectPhoneHint", { networkCount: networkCount > 1 ? t("settings.connectPhoneNetworks", { networkCount }) : "" })}</span>
    </span>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </button>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .shared {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .shared:disabled {
    opacity: 0.4;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 4px;
  }
  .section-title {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  section > .section-title {
    padding: 0 4px;
  }
  .aside {
    color: var(--muted);
    font-size: 12px;
  }
  .card {
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    box-sizing: border-box;
    padding: 10px 16px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
  .card > * + * {
    border-top: 1px solid var(--border);
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    flex: 1;
    font-size: 15px;
    font-weight: 500;
  }
  .block > .label {
    font-weight: 600;
  }
  .sub {
    color: var(--muted);
    font-size: 13px;
  }
  .block > .sub {
    margin-top: -6px;
  }

  .concert {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--surface);
    border-radius: 20px;
    background: var(--surface);
  }
  .concert.on {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .concert-icon,
  .connect-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--surface-2);
    color: var(--text);
  }
  .on .concert-icon {
    background: var(--accent);
    color: var(--on-accent);
  }
  .concert-icon svg,
  .connect-icon svg,
  .chevron,
  .add svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .lock-error {
    margin-top: 4px;
    color: var(--setting);
    font-size: 13px;
  }
  .concert-title {
    font-size: 17px;
    font-weight: 600;
  }

  .checks {
    display: grid;
    gap: 8px;
    padding: 12px;
  }
  .checks > * + * {
    border: 0;
  }
  .check {
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--setting) 14%, transparent);
    color: var(--setting);
    font-size: 13px;
  }

  .stepper {
    display: flex;
    align-items: center;
    border-radius: 12px;
    background: var(--bg);
  }
  .stepper button {
    width: 44px;
    height: 40px;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 20px;
    cursor: pointer;
  }
  .scene {
    min-width: 28px;
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .arm {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .arm-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--rec);
  }
  .block :global(.trigger) {
    height: 44px;
    background: var(--bg);
  }

  .split {
    display: flex;
    gap: 2px;
    height: 14px;
    border-radius: 6px;
    overflow: hidden;
  }
  .split span {
    flex-basis: 0;
  }
  .free {
    background: repeating-linear-gradient(135deg, var(--line) 0 4px, var(--surface-2) 4px 8px) !important;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    color: var(--muted);
    font-size: 12px;
  }
  .legend > span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .musician,
  .connect {
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    width: 100%;
    padding: 14px 16px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .connect {
    gap: 14px;
    background: var(--surface);
  }
  .card > .musician {
    border-top: 1px solid var(--border);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--c);
    font-size: 13px;
    font-weight: 700;
  }
  .musician-name {
    font-size: 16px;
    font-weight: 600;
  }
  .warn {
    margin-top: 2px;
    color: var(--setting);
    font-size: 12px;
  }
  .chevron {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--muted);
  }
  .add {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 52px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .add svg {
    width: 18px;
    height: 18px;
  }
  .add:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .note {
    display: flex;
    padding: 12px 14px;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .unassigned {
    margin: 0;
    padding: 0 14px;
    color: var(--muted);
    font-size: 13px;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
