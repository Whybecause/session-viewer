<script lang="ts">
  import type { SlotView, TrackTime } from "../../server/protocol.ts";
  import { chainLabel } from "./lib/chain-label.ts";
  import { contrastText, displayColor } from "./lib/color.ts";
  import { cappedBar, formatBars, formatTakeBars } from "./lib/recording.ts";
  import TrackIcon from "./TrackIcon.svelte";
  import { t } from "./lib/i18n.ts";

  let {
    slot,
    color,
    time,
    recTotal,
    icon,
    compact,
    overdub = false,
  }: {
    slot: SlotView | null;
    /** The track's colour: clips take it, whatever colour they have in Live. */
    color: string;
    time: TrackTime | undefined;
    /** Bars a fixed-length take was started with, shown as "2/4". */
    recTotal?: number | undefined;
    icon: string | undefined;
    compact: boolean;
    /** The track's Overdub switch is on: its playing clip swaps the track colour for a distinctive one. */
    overdub?: boolean;
  } = $props();

  const STATE_LABELS: Record<SlotView["state"], string> = {
    stopped: t("grid.slotStopped"),
    playing: t("grid.slotPlaying"),
    triggered: t("grid.slotTriggered"),
    recording: t("grid.slotRecording"),
    record_pending: t("grid.slotRecordPending"),
  };

  const isOverdubbing = $derived(overdub && slot?.state === "playing");
  const tone = $derived(isOverdubbing ? "var(--overdub)" : slot?.isEmpty ? "var(--no-notes)" : displayColor(color));
  const onTone = $derived(
    isOverdubbing ? "var(--on-overdub)" : slot?.isEmpty ? "var(--on-no-notes)" : contrastText(tone),
  );
  const isPending = $derived(slot?.state === "triggered" || slot?.state === "record_pending");
  const isStopping = $derived(slot?.recEnd === "stopping");
  // A requested stop shows when the take ends, in place of the bars taken so far.
  const countdown = $derived(isPending || isStopping ? time?.countdown : undefined);
  const progress = $derived(slot?.state === "playing" ? time?.progress : undefined);
  const recordedBars = $derived(slot?.state === "recording" ? time?.recordedBars : undefined);
  // "3/8" while playing, the length alone otherwise; the unit goes on the roomy cells only.
  // A fixed take on a roomy cell reads "2/4"; a narrow one cannot fit it and splits it into the bar and, in the corner
  // where a finished clip shows its length, the end.
  const isSplitTake = $derived(!!recordedBars && !!recTotal && !compact);
  const length = $derived.by(() => {
    if (isSplitTake && recTotal) return `${formatBars(recTotal)} B`;
    if (!slot?.lengthBars || countdown || recordedBars) return null;
    const total = formatBars(slot.lengthBars);
    const text = slot.state === "playing" && time?.positionBars ? `${formatBars(time.positionBars)}/${total}` : total;
    return compact || text.includes("/") ? text : `${text} B`;
  });
  const label = $derived(
    slot
      ? [
          slot.chain ? `chain ${chainLabel(slot.chain)}` : slot.clipName,
          STATE_LABELS[slot.state],
          isOverdubbing && t("grid.slotOverdubActive"),
          slot.isEmpty && t("grid.slotNoNotes"),
          slot.recEnd === "auto" && t("grid.slotAutoStop"),
          slot.lengthBars && t("grid.slotLength", { bars: formatBars(slot.lengthBars) }),
          recordedBars && recTotal && t("grid.slotBar", { bar: Math.min(recordedBars, recTotal), total: recTotal }),
          slot.state === "playing" && time?.positionBars && t("grid.slotPosition", { bar: time.positionBars }),
          countdown && (isStopping ? t("grid.slotCountdownEnd", { countdown }) : t("grid.slotCountdownLaunch", { countdown })),
        ]
          .filter(Boolean)
          .join(", ")
      : t("grid.slotEmpty"),
  );
</script>

{#if slot}
  <div
    class="cell {slot.state}"
    class:overdub={isOverdubbing}
    class:rec-auto={slot.recEnd === "auto"}
    class:rec-stopping={isStopping}
    class:no-notes={slot.isEmpty}
    class:compact
    style:--tone={tone}
    style:--on-tone={onTone}
    role="img"
    aria-label={label}
  >
    {#if !compact || isOverdubbing || (slot.state === "recording" && !recordedBars)}
      <span class="state-icon" aria-hidden="true"></span>
    {/if}
    {#if icon}<TrackIcon {icon} size={compact ? 17 : 20} />{/if}
    {#if !compact}
      <span class="name">{slot.chain ? chainLabel(slot.chain) : (slot.clipName ?? "")}</span>
    {/if}
    {#if slot.chain}
      <span class="chain-badge" aria-hidden="true">{slot.chain.number}</span>
    {/if}
    {#if countdown}
      <span class="countdown" aria-hidden="true">{countdown}</span>
    {:else if recordedBars}
      {#if isSplitTake}
        <span class="bars take-full" aria-hidden="true">{formatTakeBars(recordedBars, recTotal)}</span>
        <span class="bars take-bar" aria-hidden="true">{formatBars(cappedBar(recordedBars, recTotal))}</span>
      {:else}
        <span class="bars" aria-hidden="true">{formatTakeBars(recordedBars, recTotal)}</span>
      {/if}
    {/if}
    {#if length}
      <span class="length" class:take-end={isSplitTake} aria-hidden="true">{length}</span>
    {/if}
    {#if progress !== undefined}
      <span class="wipe" style:transform="scaleX({progress})" aria-hidden="true"></span>
      <span class="rail" aria-hidden="true"></span>
      <span class="progress" style:transform="scaleX({progress})" aria-hidden="true"></span>
    {/if}
    {#if slot.recEnd === "auto"}
      <span class="auto-bar" aria-hidden="true"></span>
    {/if}
  </div>
{:else}
  <div class="cell empty"><span class="dot"></span></div>
{/if}

<style>
  .cell {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    height: var(--row-h);
    padding: 0 8px;
    border-radius: var(--radius-cell);
    background: color-mix(in srgb, var(--tone) 15%, transparent);
    color: var(--tone);
    font-size: 13px;
    overflow: hidden;
    container-type: inline-size;
    isolation: isolate;
  }
  .cell.compact {
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 0;
    border-radius: var(--radius-cell);
  }
  .cell.empty {
    --tone: transparent;
    justify-content: center;
    background: var(--empty);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 1px;
    background: var(--empty-dot);
  }
  .cell.triggered {
    outline: 2px solid var(--tone);
    outline-offset: -2px;
    animation: beat-outline var(--beat, 0.5s) steps(1, end) infinite;
  }
  .cell.playing {
    background: var(--tone);
    color: var(--on-tone);
  }
  .cell.recording {
    background: var(--rec);
    color: #fff;
  }
  .cell.record_pending {
    background: var(--empty);
    color: var(--rec);
    outline: 2px solid var(--rec);
    outline-offset: -2px;
    animation: beat-outline var(--beat, 0.5s) steps(1, end) infinite;
  }
  /* Stops by itself: a dashed bar where a playing clip has its progress. A requested stop: a blinking white frame. */
  .auto-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: repeating-linear-gradient(90deg, #fff 0 5px, transparent 5px 8px);
  }
  .cell.rec-stopping::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 3px solid #fff;
    border-radius: var(--radius-cell);
    animation: beat-frame var(--beat, 0.5s) steps(1, end) infinite;
    pointer-events: none;
  }
  /* A take that got no note goes grey, recording or not: the track colour would pass it off as a usable clip. */
  .cell.recording.no-notes {
    background: var(--no-notes);
    color: var(--on-no-notes);
  }
  /* Only the frame blinks, one full cycle per beat: the number and icon inside stay readable. */
  @keyframes beat-outline {
    50% {
      outline-color: transparent;
    }
  }
  @keyframes beat-frame {
    50% {
      border-color: transparent;
    }
  }
  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.2;
  }
  .state-icon {
    flex: none;
    width: 0;
    height: 0;
  }
  .stopped .state-icon,
  .playing .state-icon,
  .triggered .state-icon {
    border-left: 9px solid currentColor;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
  }
  .recording .state-icon,
  .record_pending .state-icon {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: currentColor;
  }
  /* A hollow ring: neither REC's solid disc nor the play triangle, so overdub reads without relying on the red. */
  .cell.overdub .state-icon {
    box-sizing: border-box;
    width: 11px;
    height: 11px;
    border: 2px solid currentColor;
    border-radius: 50%;
    background: none;
  }
  .chain-badge {
    position: absolute;
    top: 2px;
    left: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    opacity: 0.85;
  }
  .countdown,
  .bars,
  .length {
    flex: none;
    font-family: var(--font-mono);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .countdown {
    font-size: 22px;
  }
  .bars {
    font-size: 15px;
  }
  .length {
    font-size: 11px;
  }
  .compact .countdown {
    font-size: 15px;
  }
  .compact .bars {
    font-size: 12px;
  }
  .compact .length {
    font-size: 10px;
  }
  /* Where it always was, outside the row: inline it is the first thing a medium column clips. */
  .cell:not(.compact) .length {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 10px;
    opacity: 0.75;
  }
  /* The countdown must stay readable: only the frame blinks, not the number. */
  .cell.triggered:has(.countdown),
  .cell.record_pending:has(.countdown) {
    animation: none;
    outline-style: dashed;
  }
  @media (prefers-reduced-motion: reduce) {
    .cell.triggered,
    .cell.record_pending {
      outline-style: dashed;
    }
  }
  /* Two cues for how far a clip is: a veil sweeping the cell, and a bar whose rail shows where it ends. */
  .wipe {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: color-mix(in srgb, var(--on-tone) 22%, transparent);
    transform-origin: left;
    transition: transform 100ms linear;
  }
  .rail,
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
  }
  .rail {
    background: color-mix(in srgb, var(--on-tone) 30%, transparent);
  }
  .progress {
    background: var(--on-tone);
    transform-origin: left;
    transition: transform 100ms linear;
  }
  /* Below this there is room for the icons and no more: a name squeezed into the few pixels left shows as a stray stroke. */
  .take-bar,
  .take-end {
    display: none;
  }
  @container (max-width: 90px) {
    .name {
      display: none;
    }
    .take-full {
      display: none;
    }
    .take-bar,
    .take-end {
      display: block;
    }
  }
  /* The number stands in for the name where the name is hidden. */
  @container (min-width: 91px) {
    .chain-badge {
      display: none;
    }
  }
</style>
