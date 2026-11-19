<script lang="ts">
  import { isIcon } from "../../server/icon.ts";
  import { ICON_GROUPS } from "./lib/icon-presets.ts";
  import { MAX_MACRO, type MacroFlag } from "../../server/protocol.ts";
  import { sendChainLabel, sendMacroFlag, sendTrackIcon, sendVolumeSource } from "./lib/session.svelte.ts";
  import { t } from "./lib/i18n.ts";
  import Field from "./Field.svelte";
  import Select, { type Choice } from "./Select.svelte";
  import Sheet from "./Sheet.svelte";
  import TrackIcon from "./TrackIcon.svelte";

  let {
    trackName,
    familyNames,
    sameNameCount,
    current,
    volumeSource,
    otherTrackNames,
    racks,
    chainRack,
    macroFlag,
    chainMacro,
    trackRacks,
    onClose,
  }: {
    trackName: string;
    familyNames: string[];
    sameNameCount: number;
    current: string | undefined;
    /** Track whose fader this one shows; undefined = its own. */
    volumeSource: string | undefined;
    /** Every other track of the set, to pick that source from. */
    otherTrackNames: string[];
    /** The track's racks, to pick the one whose active chain shows under the header. */
    racks: string[];
    /** The rack whose chain shows now; undefined = none. */
    chainRack: string | undefined;
    /** The rack macro that lights this track's header at 127; undefined = none. */
    macroFlag: MacroFlag | undefined;
    /** Rack macro, 1-16, that selects the chain. */
    chainMacro: number;
    /** Racks of every track, by track name, to pick the rack that holds the macro. */
    trackRacks: Record<string, string[]>;
    onClose: () => void;
  } = $props();

  // undefined = nothing chosen yet, null = "no icon" chosen. Starts on the track's current icon so it can be
  // copied to the whole family in one tap; the component is mounted fresh for each track, so reading it once is fine.
  // svelte-ignore state_referenced_locally
  let selected = $state<string | null | undefined>(current);
  let sheet: Sheet | undefined = $state();
  let custom = $state("");
  let error = $state("");

  const hasFamily = $derived(familyNames.length > 1);
  const familyLabel = $derived(`${familyNames[0]} → ${familyNames.at(-1)}`);

  function choose(icon: string | null) {
    selected = icon;
    error = "";
  }

  function chooseCustom(event: SubmitEvent) {
    event.preventDefault();
    const icon = custom.trim();
    if (!isIcon(icon)) {
      error = t("icons.error.singleEmojiOnly");
      return;
    }
    choose(icon);
    custom = "";
  }

  // The source is saved on change, apart from the icon's Apply: it is a routing fact, not part of the icon choice.
  const NO_SOURCE = "";
  // svelte-ignore state_referenced_locally
  let source = $state(volumeSource ?? NO_SOURCE);
  const sourceChoices = $derived.by((): Choice[] => {
    const names = volumeSource && !otherTrackNames.includes(volumeSource) ? [volumeSource, ...otherTrackNames] : otherTrackNames;
    return [
      { value: NO_SOURCE, label: t("icons.ownFader") },
      ...names.map((name) => ({ value: name, label: otherTrackNames.includes(name) ? name : `${name} (${t("icons.message.trackAbsent")})` })),
    ];
  });

  function chooseSource(name: string) {
    error = sendVolumeSource(trackName, name === NO_SOURCE ? null : name) ? "" : t("common.serverUnreachable");
  }

  const NO_CHAIN = "";
  // svelte-ignore state_referenced_locally
  let chain = $state(chainRack ?? NO_CHAIN);
  const chainChoices = $derived.by((): Choice[] => {
    const names = chainRack && !racks.includes(chainRack) ? [chainRack, ...racks] : racks;
    return [
      { value: NO_CHAIN, label: t("icons.none") },
      ...names.map((name) => ({ value: name, label: racks.includes(name) ? name : `${name} (${t("icons.message.rackAbsent")})` })),
    ];
  });

  function chooseChain(rack: string) {
    error = sendChainLabel(trackName, rack === NO_CHAIN ? null : rack) ? "" : t("common.serverUnreachable");
  }

  // Saved as soon as the three choices are made, like the two above; an incomplete choice clears the saved one,
  // so what the form shows is always what the server holds.
  const NO_FLAG = "";
  // svelte-ignore state_referenced_locally
  let flagTrack = $state(macroFlag?.track ?? NO_FLAG);
  // svelte-ignore state_referenced_locally
  let flagRack = $state(macroFlag?.rack ?? NO_FLAG);
  // svelte-ignore state_referenced_locally
  let flagMacro = $state(macroFlag ? String(macroFlag.macro) : NO_FLAG);

  const withSaved = (names: string[], saved: string | undefined, absent: string): Choice[] => {
    const all = saved && saved !== NO_FLAG && !names.includes(saved) ? [saved, ...names] : names;
    return all.map((name) => ({ value: name, label: names.includes(name) ? name : `${name} (${absent})` }));
  };
  const flagTrackChoices = $derived([
    { value: NO_FLAG, label: t("icons.none") },
    ...withSaved(
      Object.keys(trackRacks).filter((name) => trackRacks[name].length > 0),
      macroFlag?.track,
      // Listed only with racks: a saved track still in the set but now without one is not "absent".
      macroFlag && Object.hasOwn(trackRacks, macroFlag.track) ? t("icons.message.noRack") : t("icons.message.trackAbsent"),
    ),
  ]);
  const PICK: Choice = { value: NO_FLAG, label: t("icons.pick") };
  const flagRackChoices = $derived([
    PICK,
    ...withSaved(trackRacks[flagTrack] ?? [], flagTrack === macroFlag?.track ? macroFlag?.rack : undefined, t("icons.message.rackAbsent")),
  ]);
  const flagMacroChoices = [
    PICK,
    ...Array.from({ length: MAX_MACRO }, (_, i) => ({ value: String(i + 1), label: `${t("icons.fieldLabel.macro")} ${i + 1}` })),
  ];
  const hasFlagChoice = $derived(Object.values(trackRacks).some((racks) => racks.length > 0) || !!macroFlag);

  function saveFlag() {
    const complete = flagTrack !== NO_FLAG && flagRack !== NO_FLAG && flagMacro !== NO_FLAG;
    if (!complete && !macroFlag) return;
    const flag = complete ? { track: flagTrack, rack: flagRack, macro: Number(flagMacro) } : null;
    error = sendMacroFlag(trackName, flag) ? "" : t("common.serverUnreachable");
  }

  function chooseFlagTrack(name: string) {
    flagTrack = name;
    flagRack = NO_FLAG;
    flagMacro = NO_FLAG;
    saveFlag();
  }

  function chooseFlagRack(name: string) {
    flagRack = name;
    saveFlag();
  }

  function chooseFlagMacro(macro: string) {
    flagMacro = macro;
    saveFlag();
  }

  function apply(names: string[]) {
    if (selected === undefined) return;
    if (!sendTrackIcon(names, selected)) {
      error = t("common.serverUnreachable");
      return;
    }
    sheet?.close();
  }
</script>

<Sheet bind:this={sheet} title={t("icons.sheetTitle")} {onClose}>
  <div class="preview">
    <span class="preview-icon" class:empty={!selected} aria-hidden="true">{#if selected}<TrackIcon icon={selected} size={30} />{/if}</span>
    <span class="preview-text">
      <span class="preview-name">{trackName}</span>
      <span class="sub">{selected === undefined ? t("icons.status.pickIcon") : selected === null ? t("icons.status.noIcon") : t("icons.status.iconSelected")}</span>
    </span>
  </div>

  <section aria-labelledby="icons-title">
    <h3 id="icons-title">{t("icons.sectionTitle.icons")}</h3>
    <div class="groups">
    {#each ICON_GROUPS as group (group.title)}
      <div>
      <h4>{t(group.title)}</h4>
      <div class="grid">
        {#each group.presets as [icon, label] (icon)}
          <button
            type="button"
            class="tile"
            aria-pressed={selected === icon}
            aria-label={t(label)}
            title={t(label)}
            onclick={() => choose(icon)}><TrackIcon {icon} size={26} /></button
          >
        {/each}
      </div>
      </div>
    {/each}
    </div>
    <div class="grid none-row">
      <button type="button" class="tile none" aria-pressed={selected === null} onclick={() => choose(null)}>
        {t("icons.none")}
      </button>
    </div>
  </section>

  <section aria-labelledby="custom-title">
    <h3 id="custom-title">{t("icons.sectionTitle.customEmoji")}</h3>
    <form class="card custom" onsubmit={chooseCustom}>
      <input type="text" maxlength="32" placeholder={t("icons.placeholder.customEmoji")} aria-labelledby="custom-title" bind:value={custom} />
      <button type="submit" disabled={!custom.trim()}>OK</button>
    </form>
  </section>

  <section aria-labelledby="source-title">
    <h3 id="source-title">{t("icons.sectionTitle.displayedFader")}</h3>
    <p class="hint">{t("icons.hint.displayedFader")}</p>
    <Select
      label={t("icons.selectLabel.displayedFader", { trackName })}
      options={sourceChoices}
      bind:value={source}
      invalid={!!volumeSource && !otherTrackNames.includes(volumeSource)}
      onchange={chooseSource}
    />
  </section>

  {#if racks.length > 0 || chainRack}
    <section aria-labelledby="chain-title">
      <h3 id="chain-title">{t("icons.sectionTitle.displayedChain")}</h3>
      <p class="hint">{t("icons.hint.displayedChain", { chainMacro })}</p>
      <Field label={t("icons.fieldLabel.rack")}>
        <Select
          label={t("icons.selectLabel.displayedChain", { trackName })}
          options={chainChoices}
          bind:value={chain}
          invalid={!!chainRack && !racks.includes(chainRack)}
          onchange={chooseChain}
        />
      </Field>
    </section>
  {/if}

  {#if hasFlagChoice}
    <section aria-labelledby="flag-title">
      <h3 id="flag-title">{t("icons.sectionTitle.effectFlag")}</h3>
      <p class="hint">{t("icons.hint.effectFlag", { trackName })}</p>
      <div class="flag-fields">
        <Field label={t("icons.fieldLabel.track")}>
          <Select
            label={t("icons.selectLabel.flagTrack", { trackName })}
            options={flagTrackChoices}
            bind:value={flagTrack}
            invalid={!!macroFlag && !Object.hasOwn(trackRacks, macroFlag.track)}
            onchange={chooseFlagTrack}
          />
        </Field>
        {#if flagTrack !== NO_FLAG}
          <Field label={t("icons.fieldLabel.rack")}>
            <Select
              label={t("icons.selectLabel.flagRack", { trackName })}
              options={flagRackChoices}
              bind:value={flagRack}
              invalid={!!macroFlag && flagRack === macroFlag.rack && !(trackRacks[flagTrack] ?? []).includes(flagRack)}
              onchange={chooseFlagRack}
            />
          </Field>
          <Field label={t("icons.fieldLabel.macro")}>
            <Select label={t("icons.selectLabel.flagMacro", { trackName })} options={flagMacroChoices} bind:value={flagMacro} onchange={chooseFlagMacro} />
          </Field>
        {/if}
      </div>
    </section>
  {/if}

  {#snippet footer()}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if hasFamily}
      <div class="actions">
        <button type="button" class="ghost" disabled={selected === undefined} onclick={() => apply(familyNames)}>
          {t("icons.button.wholeFamily")}
          <span class="span-label">{familyLabel}</span>
        </button>
        <button type="button" class="primary" disabled={selected === undefined} onclick={() => apply([trackName])}>
          {t("icons.button.only", { trackName })}{sameNameCount > 1 ? ` (${sameNameCount})` : ""}
        </button>
      </div>
    {:else}
      <div class="actions">
        <button type="button" class="ghost" onclick={() => sheet?.close()}>{t("common.cancel")}</button>
        <button type="button" class="primary" disabled={selected === undefined} onclick={() => apply([trackName])}>
          {sameNameCount > 1 ? t("icons.button.applyWithCount", { count: sameNameCount }) : t("icons.button.apply")}
        </button>
      </div>
    {/if}
  {/snippet}
</Sheet>

<style>
  .preview {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 4px 0 20px;
    padding: 12px 14px;
    border-radius: var(--radius-panel);
    background: var(--surface-2);
  }
  .preview-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-panel);
    background: var(--surface);
    unicode-bidi: isolate;
    overflow: hidden;
  }
  .preview-icon.empty {
    border: 1.5px dashed var(--border);
  }
  .preview-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .preview-name {
    overflow: hidden;
    font-size: 17px;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
    gap: 8px;
  }
  /* Wide screens: the families side by side, each as one row of tiles, instead of a mostly empty row each. */
  @media (min-width: 1000px) and (min-height: 700px) {
    .groups {
      display: flex;
      flex-wrap: wrap;
      column-gap: 28px;
    }
    .groups .grid {
      display: flex;
      flex-wrap: wrap;
    }
    .groups .tile {
      width: 56px;
    }
  }
  .tile {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1.5px solid transparent;
    border-radius: var(--radius-panel);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
  }
  .tile:active {
    transform: scale(0.94);
  }
  .tile[aria-pressed="true"] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .tile.none {
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }
  .custom {
    display: flex;
    gap: 8px;
    padding: 6px;
  }
  .custom input {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  .custom button {
    flex: none;
    padding: 0 16px;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .custom button:disabled {
    opacity: 0.4;
  }
  .flag-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .none-row {
    margin-top: 12px;
  }
  h4 {
    margin: 14px 0 6px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .span-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    opacity: 0.75;
  }
</style>
