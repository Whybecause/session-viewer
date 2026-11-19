<script lang="ts">
  import type { TrackView } from "../../server/protocol.ts";
  import { contrastText, displayColor } from "./lib/color.ts";
  import TrackIcon from "./TrackIcon.svelte";
  import { t } from "./lib/i18n.ts";

  let {
    track,
    icon,
    compact,
    showArm,
    signalSend,
    onEdit,
  }: {
    track: TrackView;
    icon: string | undefined;
    compact: boolean;
    showArm: boolean;
    /** Letter of the send whose level above 0 marks the header, null when none is chosen. */
    signalSend: string | null;
    onEdit: () => void;
  } = $props();


  const tone = $derived(displayColor(track.color));

  // A track a family cue covers follows its cue send; the others keep Live's solo.
  const isCued = $derived(track.cue ?? track.solo);
  const label = $derived(
    [
      track.name,
      showArm && track.armed && t("grid.trackArmed"),
      track.muted && t("grid.trackMuted"),
      isCued && t("grid.trackCueActive"),
      track.fx && t("grid.trackFxActive"),
      track.sendOn && signalSend && t("grid.trackSendOpen", { letter: signalSend }),
      track.stopPending && t("grid.trackStopPending"),
      t("grid.trackFader", { volume: Math.round(track.volume * 100) }),
    ]
      .filter(Boolean)
      .join(", "),
  );
</script>

<button
  type="button"
  class="track"
  class:compact
  class:muted={track.muted}
  class:cue={isCued}
  class:fx={track.fx}
  class:stopping={track.stopPending}
  style:--track-color={tone}
  style:--on-track={contrastText(tone)}
  style:--volume={track.volume}
  title="{track.name} — {t('grid.editTrackIcon')}"
  aria-label="{label}, {t('grid.editTrackIcon')}"
  onclick={onEdit}
>
  <span class="level" aria-hidden="true"></span>
  <span class="zero-db" aria-hidden="true"></span>
  {#if track.sendOn}<span class="send-mark" aria-hidden="true"></span>{/if}
  <span class="name" aria-hidden="true">{track.name}</span>
  <!-- Fixed height and states drawn over the header: nothing appearing or disappearing may move the name. -->
  <span class="foot" aria-hidden="true">
    {#if icon}<TrackIcon {icon} size={compact ? 18 : 21} />{/if}
    {#if showArm && track.armed}<span class="arm"></span>{/if}
  </span>
</button>

<style>
  .track {
    /* Live's volume parameter sits at 0.85 for 0 dB. */
    --zero-db: 85%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    box-sizing: border-box;
    width: 100%;
    height: var(--header-h);
    padding: 8px 6px 5px;
    border: 0;
    border-radius: var(--radius-cell);
    background: var(--surface);
    box-shadow: inset 0 3px 0 var(--track-color);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    cursor: pointer;
  }
  /* Live greys out a deactivated track the same way. */
  .track.muted {
    opacity: 0.4;
  }
  /* Lit: the cue is the one header that must be found at a glance, with no text. */
  .track.cue {
    background: var(--track-color);
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 3px var(--track-color),
      0 0 14px color-mix(in srgb, var(--track-color) 55%, transparent);
    color: var(--on-track);
  }
  /* An outline rather than a fill: the fill is the cue's, and the red blink of a pending stop draws over it. */
  .track.fx::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2px var(--fx);
    pointer-events: none;
  }
  /* A folded corner: it takes no room, so the name never moves. On a lit cue it takes the text colour, since amber
     would vanish on an orange or yellow track. */
  .send-mark {
    position: absolute;
    top: 0;
    left: 0;
    width: 15px;
    height: 15px;
    background: var(--setting);
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }
  .track.cue .send-mark {
    background: currentColor;
  }
  .track:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }
  .track.compact {
    align-items: center;
    padding: 8px 4px 4px;
  }
  /* Two lines rather than an ellipsis: the number that tells ALEX 1 from ALEX 2 sits at the end. */
  .name {
    position: relative;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    min-width: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.2;
  }
  .compact .name {
    display: block;
    flex: 1;
    min-height: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 11px;
  }
  .track:not(.cue) .foot {
    color: var(--track-color);
  }
  .foot {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    height: 21px;
    margin-top: auto;
    overflow: hidden;
  }
  .compact .foot {
    flex-direction: column;
    justify-content: flex-end;
    height: 36px;
    margin-top: 0;
  }
  .arm {
    flex: none;
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    border: 2px solid var(--rec);
    border-radius: 50%;
  }
  .stopping::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2px var(--rec);
    animation: blink var(--beat, 0.5s) steps(2) infinite;
    pointer-events: none;
  }
  /* Read-only: the mix is set elsewhere, the fill only says where the fader sits. */
  .level {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, currentColor 16%, transparent);
    transform: scaleY(var(--volume));
    transform-origin: bottom;
  }
  .zero-db {
    position: absolute;
    right: 0;
    bottom: var(--zero-db);
    width: 6px;
    height: 1px;
    background: color-mix(in srgb, currentColor 60%, transparent);
  }
  /* A phone on its side: one line per name, the fill running left to right. */
  @media (orientation: landscape) and (max-height: 500px) {
    .track,
    .track.compact {
      flex-direction: row;
      align-items: center;
      gap: 4px;
      padding: 4px 6px;
    }
    .name,
    .compact .name {
      display: block;
      flex: 1;
      writing-mode: horizontal-tb;
      transform: none;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 11px;
    }
    .foot,
    .compact .foot {
      flex-direction: row;
      width: auto;
      height: auto;
      margin-top: 0;
    }
    .foot :global(.icon),
    .foot :global(.emoji) {
      display: none;
    }
    .level {
      transform: scaleX(var(--volume));
      transform-origin: left;
    }
    .zero-db {
      inset: auto auto 0 var(--zero-db);
      width: 1px;
      height: 6px;
    }
  }
</style>
