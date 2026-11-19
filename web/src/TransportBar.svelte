<script lang="ts">
  import type { Transport } from "../../server/protocol.ts";
  import { t } from "./lib/i18n.ts";

  let { transport, tempo }: { transport: Transport | undefined; tempo: number | undefined } = $props();

  const position = $derived(transport ? `${transport.bar}.${transport.beat}.${transport.sub}` : "–");
  const beats = $derived(Array.from({ length: transport?.beatsPerBar ?? 4 }, (_, i) => i + 1));
  const label = $derived(
    transport
      ? t("grid.transportStatus", {
          state: transport.playing ? t("grid.transportPlaying") : t("grid.transportStopped"),
          bar: transport.bar,
          beat: transport.beat,
          beatsPerBar: transport.beatsPerBar,
        }) + (tempo ? `, ${tempo} BPM` : "")
      : t("grid.transportUnavailable"),
  );
</script>

<div class="transport" role="img" aria-label={label}>
  <svg class="state" class:playing={transport?.playing} viewBox="0 0 12 12" aria-hidden="true">
    {#if transport?.playing}
      <path d="M2 1.5v9l8-4.5z" />
    {:else}
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
    {/if}
  </svg>
  <span class="position" aria-hidden="true">{position}</span>
  {#if tempo}<span class="tempo" aria-hidden="true">{Math.round(tempo * 10) / 10} BPM</span>{/if}
  <span class="beats" aria-hidden="true">
    {#each beats as beat (beat)}
      <span class="beat" class:past={transport && beat < transport.beat} class:current={transport?.beat === beat}></span>
    {/each}
  </span>
</div>

<style>
  .transport {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 30px;
    padding: 0 10px;
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono);
  }
  .state {
    flex: none;
    width: 11px;
    height: 11px;
    fill: var(--muted);
  }
  .state.playing {
    fill: var(--text);
  }
  .position {
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tempo {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .beats {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .beat {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--beat-next);
  }
  .beat.past {
    background: var(--beat-past);
  }
  .beat.current {
    background: var(--text);
  }
</style>
