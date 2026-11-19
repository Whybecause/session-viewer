<script lang="ts">
  import { isError, musicianIssues, spanIndexes } from "../../server/musicians.ts";
  import type { ControlsMessage, Musician, RecLengths, RecLengthWriter, RecTakes, SessionView, Settings, TrackTime, Transport } from "../../server/protocol.ts";
  import ControlsPanel from "./ControlsPanel.svelte";
  import { myControls } from "./lib/controls.ts";
  import { diagnostics } from "./lib/diagnostics.ts";
  import FamilyNav from "./FamilyNav.svelte";
  import IconPicker from "./IconPicker.svelte";
  import { fullscreen, toggleFullscreen } from "./lib/fullscreen.svelte.ts";
  import { myFamily } from "./lib/my-family.svelte.ts";
  import { recTotalBars } from "./lib/recording.ts";
  import RecordingBanner from "./RecordingBanner.svelte";
  import { onMount, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { displayColor } from "./lib/color.ts";
  import { DEFAULT_VISIBLE_TRACKS, viewSpan } from "./lib/family-view.ts";
  import { iconFor } from "./lib/icons.ts";
  import { recBar } from "./lib/rec-bar.svelte.ts";
  import { chainLabel, chainRow } from "./lib/chain-label.ts";
  import { formatRecLength, recLengthSpan } from "./lib/rec-length.ts";
  import { familyMembers } from "../../server/track-families.ts";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SlotCell from "./SlotCell.svelte";
  import TrackHeader from "./TrackHeader.svelte";
  import TransportBar from "./TransportBar.svelte";
  import { t, plural } from "./lib/i18n.ts";

  let {
    session,
    times,
    settings,
    recLengths,
    recTakes,
    tempo,
    transport,
    controls,
    recLengthWriters,
  }: {
    session: SessionView;
    times: Record<number, TrackTime>;
    settings: Settings;
    recLengths: RecLengths;
    recTakes: RecTakes;
    tempo: number | undefined;
    transport: Transport | undefined;
    controls: ControlsMessage | null;
    recLengthWriters: RecLengthWriter[];
  } = $props();

  const GAP_PX = 3;
  // Past this tempo a beat-long blink turns into a strobe.
  const MAX_BLINK_TEMPO = 240;
  const SETTLE_MS = 1500;
  // A phone on its side: everything moves to one top bar and the headers shrink.
  const landscape = new MediaQuery("(orientation: landscape) and (max-height: 500px)");
  const SETTLE_CHECK_MS = 350;
  const MIN_COLUMN_PX = 20;
  const MAX_COLUMN_PX = 160;
  const COMPACT_BELOW_PX = 48;
  const ROW_PX = 48;
  const COMPACT_ROW_PX = 44;

  // Separate deriveds keep the same array identity while only the other half of `session` changes,
  // so a fader move on one track does not invalidate every scene row.
  const tracks = $derived(session.tracks);
  const scenes = $derived(session.scenes);

  let header: HTMLDivElement | undefined = $state();
  let body: HTMLDivElement | undefined = $state();
  let rows: HTMLDivElement | undefined = $state();
  let editingTrackId = $state<string | null>(null);
  let settingsPanel: SettingsPanel | undefined = $state();
  let scrollLeft = $state(0);
  // Read once per label, when it is created: lengths that arrive with the page are not news, later ones are.
  let hasSettled = $state(false);
  onMount(() => {
    const timer = setTimeout(() => (hasSettled = true), SETTLE_MS);
    return () => clearTimeout(timer);
  });

  const trackNames = $derived(tracks.map((t) => t.name));
  const trackColors = $derived(tracks.map((t) => displayColor(t.color)));
  const trackRacks = $derived(Object.fromEntries(tracks.map((t) => [t.name, t.racks ?? []])));
  const musicians = $derived(settings.musicians);
  const colorOfTrack = (index: number) => (tracks[index] ? displayColor(tracks[index].color) : "var(--muted)");
  const spanOf = (musician: Musician) => viewSpan(trackNames, musician.view);
  // Their own colour, else the one of the first track of their view.
  const colorOf = (musician: Musician) => musician.color ?? colorOfTrack(spanOf(musician).start);
  const tabs = $derived(musicians.map((m) => ({ name: m.name, color: colorOf(m) })));
  const musicianColors = $derived(Object.fromEntries(tabs.map((t) => [t.name, t.color])));
  const issueCount = $derived(musicianIssues(trackNames, musicians, (name) => trackRacks[name]).filter(isError).length);
  const checks = $derived(diagnostics(musicians, recLengths, recLengthWriters, controls, settings.recLengthFiles));
  const toCheck = $derived(issueCount + checks.length);
  // The length each musician's record switches will use, over the tracks they drive.
  const recBands = $derived(
    settings.recLengthFiles
      ? musicians.flatMap((musician) => {
          if (!Object.hasOwn(recLengths, musician.name)) return [];
          const span = recLengthSpan(trackNames, musician);
          return span ? [{ ...span, name: musician.name, value: formatRecLength(recLengths[musician.name]) }] : [];
        })
      : [],
  );
  const mine = $derived(myControls(controls, myFamily.name));
  // A phone column fits a number, not a name: the name then lives in the tooltip and the macros panel.
  const CHAIN_NAME_MIN_PX = 64;
  const chainCells = $derived(
    tracks.flatMap((track, index) => {
      if (track.chain === undefined) return [];
      const full = track.chain ? chainLabel(track.chain) : "—";
      const text = track.chain && columnWidth < CHAIN_NAME_MIN_PX ? String(track.chain.number) : full;
      return [{ index, id: track.id, text, full }];
    }),
  );
  const chainRowIndex = $derived(chainRow(chainCells.map((c) => c.index), recBands));
  // The musician a track belongs to: the first whose view spans it.
  const ownerOf = (index: number) => {
    const owner = musicians.find((m) => {
      const found = spanIndexes(trackNames, m.view);
      return found !== null && index >= found.start && index <= found.end;
    });
    return owner ? { name: owner.name, color: musicianColors[owner.name] } : null;
  };
  // By the column's centre: a sliver at the edge cannot be read, so its take still needs the reminder.
  const isOnScreen = (index: number) => {
    const centre = index * (columnWidth + GAP_PX) + columnWidth / 2;
    return centre >= scrollLeft && centre <= scrollLeft + available;
  };

  const editing = $derived.by(() => {
    const index = tracks.findIndex((t) => t.id === editingTrackId);
    if (index < 0) return null;
    const name = trackNames[index];
    const family = [...new Set(familyMembers(trackNames, index).map((i) => trackNames[i]))];
    return {
      id: tracks[index].id,
      name,
      family,
      sameNameCount: trackNames.filter((n) => n === name).length,
      racks: tracks[index].racks ?? [],
    };
  });
  let sceneWidth = $state(0);
  let available = $state(0);

  // The musician last shown sets the column width, so one watching 8 tracks gets wider columns than one watching 12.
  let viewFamily = $state<string | null>(null);
  const span = $derived.by(() => {
    const musician = musicians.find((m) => m.name === viewFamily);
    return musician ? spanOf(musician) : { start: 0, count: DEFAULT_VISIBLE_TRACKS };
  });
  // Numbers, not the span object: `span` is rebuilt on every track update (a fader move), and an effect reading
  // it directly would scroll the view back to the family each time.
  const spanStart = $derived(span.start);
  const visible = $derived(Math.max(1, Math.min(span.count, tracks.length)));
  const columnWidth = $derived(
    available > 0
      ? Math.min(MAX_COLUMN_PX, Math.max(MIN_COLUMN_PX, Math.floor((available - GAP_PX * (visible - 1)) / visible)))
      : 96,
  );
  // Flips once, when the grid is first measured: effects reading `available` itself would rerun on every rotation.
  const measured = $derived(available > 0);
  const compact = $derived(columnWidth < COMPACT_BELOW_PX);
  const rowHeight = $derived(compact ? COMPACT_ROW_PX : ROW_PX);

  const sceneCount = $derived(scenes.length);
  const startIndex = $derived(Math.min(Math.max(settings.startScene - 1, 0), Math.max(sceneCount - 1, 0)));
  const firstShown = $derived(settings.hideScenesBefore ? startIndex : 0);
  const shownScenes = $derived(scenes.slice(firstShown).map((scene, i) => ({ scene, index: firstShown + i })));
  const selectedRow = $derived(session.selectedScene - firstShown);

  // Depends only on values that rarely change, so neither a track update nor a rotation throws a musician back to
  // the start scene.
  $effect(() => {
    if (!rows || !measured) return;
    const offset = startIndex - firstShown;
    rows.scrollTo({ top: offset * (untrack(() => rowHeight) + GAP_PX) });
  });

  // Opens on the musician's own view and follows a change of musician; nothing else is tracked, so a track added
  // elsewhere in the set does not pull the view back.
  $effect(() => {
    const name = myFamily.name;
    if (!body || !measured || name === null) return;
    untrack(() => void showFamily(name));
  });

  // Keeps the view on its first track when the columns resize: a span saved from the settings arrives after the
  // scroll, and a rotation changes the width too.
  $effect(() => {
    void [spanStart, columnWidth];
    if (!body || !measured || viewFamily === null) return;
    untrack(jumpToSpan);
  });

  let touchedSince = 0;

  /**
   * Jumps without animation, then checks it landed. On iPhone a flick keeps scrolling for about a second, and that
   * momentum, like an interrupted smooth scroll, would otherwise leave the view stopped halfway.
   */
  function jumpToSpan() {
    const el = body;
    if (!el) return;
    const target = () => Math.min(spanStart * (columnWidth + GAP_PX), el.scrollWidth - el.clientWidth);
    // Hiding the overflow for one assignment is what stops a running momentum scroll in WebKit.
    el.style.overflowX = "hidden";
    el.scrollLeft = target();
    el.style.overflowX = "";
    const touch = touchedSince;
    setTimeout(() => {
      if (touch === touchedSince && Math.abs(el.scrollLeft - target()) > 1) el.scrollLeft = target();
    }, SETTLE_CHECK_MS);
  }

  async function showFamily(name: string) {
    viewFamily = name;
    await tick();
    jumpToSpan();
  }
</script>

{#if !fullscreen.on}
  <div class="toolbar">
    <FamilyNav {tabs} active={viewFamily} mine={myFamily.name} onSelect={(name) => showFamily(name)} />
    {#if landscape.current && recBar.shown}
      <RecordingBanner inline {tracks} {times} {recTakes} {isOnScreen} {ownerOf} />
    {/if}
    {#if toCheck > 0}
      {@const text = plural("grid.issues", toCheck)}
      <button
        type="button"
        class="issues"
        aria-label={text}
        onclick={() => settingsPanel?.open(checks.length > 0 ? "checks" : "musicians")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19L12 4Zm0 6v5m0 2.5v.01" /></svg>
        <span class="issues-text" aria-hidden="true">{text}</span>
        <span class="issues-count" aria-hidden="true">{toCheck}</span>
      </button>
    {/if}
    <SettingsPanel bind:this={settingsPanel} {settings} {sceneCount} {trackNames} {trackColors} {checks} {musicianColors} {trackRacks} returns={session.returns} />
    <div class="transport-slot"><TransportBar {transport} {tempo} /></div>
  </div>
{/if}

<div
  class="viewer"
  class:compact
  style:--gap="{GAP_PX}px"
  style:--row-h="{rowHeight}px"
  style:--columns="repeat({tracks.length}, {columnWidth}px)"
  style:--col-w="{columnWidth}px"
  style:--beat={tempo ? `${60 / Math.min(tempo, MAX_BLINK_TEMPO)}s` : undefined}
  style:--rows={shownScenes.length}
>
  <div class="header" bind:this={header}>
    <div class="corner" style:width="{sceneWidth}px">
      <button
        type="button"
        class="fullscreen"
        aria-pressed={fullscreen.on}
        aria-label={fullscreen.on ? t("grid.showToolbar") : t("grid.fullscreen")}
        onclick={toggleFullscreen}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if fullscreen.on}
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          {:else}
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          {/if}
        </svg>
      </button>
    </div>
    <div class="tracks">
      {#each tracks as track, ti (track.id)}
        <TrackHeader
          {track}
          {compact}
          showArm={settings.showArm}
          signalSend={settings.signalSend}
          icon={iconFor(settings.trackIcons, track.name)}
          onEdit={() => (editingTrackId = track.id)}
        />
      {/each}
      {#each recBands as band (band.name)}
        <div class="rec-length" style:grid-column="{band.start + 1} / span {band.count}">
          <!-- Keyed by value: a new length is a new element, and its entry animation is the flash. -->
          {#key band.value}<span class="rec-label" class:flash={untrack(() => hasSettled)}>REC <strong>{band.value}</strong></span>{/key}
        </div>
      {/each}
      {#each chainCells as cell (cell.id)}
        <div class="chain-cell" style:grid-column={cell.index + 1} style:grid-row={chainRowIndex} title={cell.full}>
          <span class="chain-label">{cell.text}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- One axis per scroller: phones lock a gesture to a single scroller, a 2D scroller drifts sideways. -->
  <div class="vscroll" bind:this={rows}>
    {#if selectedRow >= 0 && selectedRow < shownScenes.length}
      <div class="row-active" style:top="{selectedRow * (rowHeight + GAP_PX) - 2}px" aria-hidden="true"></div>
    {/if}
    <div class="scenes" bind:clientWidth={sceneWidth}>
      {#each shownScenes as { scene, index } (scene.id)}
        <div class="scene" class:selected={index === session.selectedScene} title={scene.name}>
          <span class="number">{index + 1}</span>
          {#if scene.name}<span class="scene-name">{scene.name}</span>{/if}
        </div>
      {/each}
    </div>
    <!-- The touch handlers only note that a finger is on the grid; they do nothing a keyboard would need. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="hscroll"
      bind:this={body}
      bind:clientWidth={available}
      onscroll={(e) => {
        scrollLeft = e.currentTarget.scrollLeft;
        if (header) header.scrollLeft = scrollLeft;
      }}
      ontouchstart={() => touchedSince++}
      onpointerdown={() => touchedSince++}
      onwheel={() => touchedSince++}
    >
      <!-- One column per track: an update to one track then re-renders only its own column. -->
      <div class="slots">
        {#each tracks as track, ti (track.id)}
          <div class="column" class:stopping={track.stopPending}>
            {#each shownScenes as { index: si } (si)}
              <SlotCell
                slot={track.slots[si] ?? null}
                color={track.color}
                time={times[ti]}
                recTotal={recTotalBars(track.slots[si]?.recEnd, track.name, recTakes)}
                icon={iconFor(settings.trackIcons, track.name)}
                {compact}
                overdub={track.overdub}
              />
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

{#if recBar.shown && !(landscape.current && !fullscreen.on)}
  <RecordingBanner {tracks} {times} {recTakes} {isOnScreen} {ownerOf} />
{/if}

{#if mine}
  <ControlsPanel controls={mine} landscape={landscape.current} />
{/if}

{#if editing}
  {#key editing.id}
    <IconPicker
      trackName={editing.name}
      familyNames={editing.family}
      sameNameCount={editing.sameNameCount}
      current={iconFor(settings.trackIcons, editing.name)}
      volumeSource={settings.volumeSources[editing.name]}
      otherTrackNames={[...new Set(trackNames)].filter((n) => n !== editing.name)}
      racks={editing.racks}
      chainRack={settings.chainLabels[editing.name]}
      macroFlag={settings.macroFlags?.[editing.name]}
      chainMacro={settings.chainMacro}
      {trackRacks}
      onClose={() => (editingTrackId = null)}
    />
  {/key}
{/if}

<style>
  .toolbar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 6px;
    margin-bottom: 8px;
  }
  .transport-slot {
    flex: 1 0 100%;
    order: 1;
  }
  .issues {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 12px;
    border: 1px solid color-mix(in srgb, var(--setting) 45%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--setting) 14%, var(--surface));
    color: var(--setting);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .issues-count {
    display: none;
  }
  @media (max-width: 640px) {
    .issues-text {
      display: none;
    }
    .issues-count {
      display: inline;
    }
  }
  .issues svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .viewer {
    --header-h: 64px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .viewer.compact {
    --header-h: 112px;
  }
  .header,
  .vscroll {
    display: flex;
    gap: var(--gap);
    /* Same gutter on both so header and body columns stay aligned with classic scrollbars. */
    scrollbar-gutter: stable;
  }
  .header {
    flex: none;
    overflow: hidden;
    margin-bottom: var(--gap);
  }
  .corner {
    flex: none;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--bg);
  }
  .fullscreen {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .fullscreen[aria-pressed="true"] {
    color: var(--text);
  }
  .fullscreen:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .fullscreen svg {
    width: min(22px, 80%);
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tracks {
    flex: 1;
    display: grid;
    grid-template-columns: var(--columns);
    gap: var(--gap);
  }
  /* A line over the tracks a musician's record switches drive, the label cutting it. */
  .rec-length {
    grid-row: 2;
    position: relative;
    display: grid;
    place-items: center;
    height: 15px;
    margin-top: -4px;
  }
  .rec-length::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: var(--line);
  }
  .rec-label {
    position: relative;
    padding: 0 6px;
    background: var(--bg);
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    line-height: 15px;
    white-space: nowrap;
  }
  .rec-label strong {
    color: var(--text);
    font-weight: 700;
  }
  .chain-cell {
    min-width: 0;
    height: 15px;
    margin-top: -4px;
  }
  .chain-label {
    display: block;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rec-label.flash {
    animation: rec-flash 0.7s ease-out;
  }
  /* The length has its own colour, so it needs its own flash: it would stay light on the light background. */
  .rec-label.flash strong {
    animation: rec-flash-length 0.7s ease-out;
  }
  @keyframes rec-flash {
    0%,
    40% {
      background: var(--text);
      color: var(--bg);
    }
  }
  @keyframes rec-flash-length {
    0%,
    40% {
      color: var(--bg);
    }
  }
  .slots {
    flex: 1;
    display: flex;
    gap: var(--gap);
  }
  /* Off-screen columns (117 of 131 on a phone) skip layout and paint; the intrinsic size keeps scroll positions exact. */
  .column {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    width: var(--col-w);
    content-visibility: auto;
    contain-intrinsic-size: var(--col-w) calc(var(--rows) * var(--row-h) + (var(--rows) - 1) * var(--gap));
  }
  /* An outline, not a border: a pending stop must not move a single cell. */
  .column.stopping {
    border-radius: 4px;
    outline: 2px solid var(--rec);
    outline-offset: -2px;
    animation: blink var(--beat, 0.5s) steps(2) infinite;
  }
  .vscroll {
    position: relative;
    flex: 1;
    min-height: 0;
    align-items: start;
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 8px;
  }
  .row-active {
    position: absolute;
    left: 0;
    right: 0;
    height: calc(var(--row-h) + 4px);
    border-radius: var(--radius-cell);
    background: var(--row-active);
  }
  .scenes,
  .hscroll {
    position: relative;
  }
  .scenes {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    max-width: 110px;
  }
  .hscroll {
    flex: 1;
    min-width: 0;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
  }
  .scene {
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    height: var(--row-h);
    padding: 0 2px;
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
  }
  .number {
    flex: none;
    min-width: 26px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    line-height: 24px;
    text-align: center;
  }
  .scene-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The selected scene: a light pill, the width of the column unchanged or the compact mode would flip. */
  .scene.selected {
    color: var(--text);
  }
  .scene.selected .number {
    background: var(--text);
    color: var(--bg);
  }
  @media (orientation: landscape) and (max-height: 500px) {
    .toolbar {
      flex-wrap: nowrap;
    }
    .transport-slot {
      flex: 0 1 auto;
      order: 0;
    }
    .viewer,
    .viewer.compact {
      --header-h: 30px;
    }
  }
</style>
