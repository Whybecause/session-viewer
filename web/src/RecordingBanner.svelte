<script lang="ts">
  import { untrack } from "svelte";
  import type { RecTakes, TrackTime, TrackView } from "../../server/protocol.ts";
  import { type HeldRecordingTrack, holdRecording, recordingTracks, takeDetail } from "./lib/recording.ts";

  export interface Owner {
    name: string;
    color: string;
  }

  let {
    tracks,
    times,
    recTakes,
    isOnScreen,
    ownerOf,
    inline = false,
  }: {
    tracks: TrackView[];
    times: Record<number, TrackTime>;
    recTakes: RecTakes;
    /** A take whose column is already in view needs no reminder, unless it got no note. */
    isOnScreen: (trackIndex: number) => boolean;
    ownerOf: (trackIndex: number) => Owner | null;
    /** A pill in the top bar instead of the bar under the grid. */
    inline?: boolean;
  } = $props();

  const HOLD_MS = 800;

  const recording = $derived(recordingTracks(tracks, recTakes));
  let shown = $state.raw<HeldRecordingTrack[]>([]);
  let expireTimer: ReturnType<typeof setTimeout> | undefined;

  function refresh() {
    const now = Date.now();
    shown = holdRecording(shown, recording, now, HOLD_MS);
    clearTimeout(expireTimer);
    // Wakes when the oldest held track expires, not a full hold later.
    const held = shown.filter((t) => t.seenAt < now);
    if (held.length > 0) expireTimer = setTimeout(refresh, Math.min(...held.map((t) => t.seenAt)) + HOLD_MS - now);
  }

  // Reruns on `recording` only: refresh reads and writes `shown`, which must not retrigger it.
  $effect(() => {
    void recording;
    untrack(refresh);
    return () => clearTimeout(expireTimer);
  });
</script>

<!-- Always there, at a fixed height: a bar that appears would push the whole grid. -->
<div class="bar" class:inline role="status">
  {#each shown.filter((t) => t.isEmpty || !isOnScreen(t.index)) as take (take.index)}
    {@const detail = takeDetail(take, times[take.index])}
    {@const owner = ownerOf(take.index)}
    <span
      class="item"
      class:empty={take.isEmpty}
      class:pending={take.isPending}
      class:auto={take.recEnd === "auto"}
      class:stopping={take.recEnd === "stopping"}
    >
      <span class="dot" aria-hidden="true"></span>
      {#if owner}<span class="owner" style:--owner={owner.color}>{owner.name}</span>{/if}
      <span class="take">{take.name}</span>
      <!-- Out of the live region: the bar count changes every bar and would be read out each time. -->
      {#if detail}<span aria-hidden={!take.isEmpty}>· {detail}</span>{/if}
    </span>
  {/each}
</div>

<style>
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    margin-top: 6px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 6px;
    background: var(--surface);
    overflow: hidden;
    font-weight: 700;
  }
  .bar.inline {
    height: auto;
    margin: 0;
    padding: 0;
    background: transparent;
  }
  .bar.inline:empty {
    display: none;
  }
  .owner {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }
  .owner::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--owner);
  }
  .take {
    font-weight: 600;
    opacity: 0.9;
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    box-sizing: border-box;
    border: 2px solid var(--rec);
    border-radius: 6px;
    background: var(--rec);
    color: #fff;
    white-space: nowrap;
  }
  .item.pending {
    background: transparent;
    color: var(--text);
  }
  .item.empty {
    border-color: var(--setting);
    background: var(--setting);
    color: var(--on-setting);
  }
  .item.empty .dot {
    background: var(--on-setting);
  }
  /* Same marks as the slot cell: dashed = stops by itself, blinking white = stop requested. */
  .item.auto {
    border: 2px dashed #fff;
  }
  .item.stopping {
    position: relative;
  }
  .item.stopping::after {
    content: "";
    position: absolute;
    inset: -2px;
    border: 3px solid #fff;
    border-radius: 6px;
    animation: blink var(--beat, 0.5s) steps(2) infinite;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    animation: pulse 1s ease-in-out infinite;
  }
  .pending .dot {
    background: var(--rec);
    animation: blink var(--beat, 0.5s) steps(2) infinite;
  }
</style>
