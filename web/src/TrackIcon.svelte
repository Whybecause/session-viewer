<script lang="ts">
  import { iconShape } from "./lib/icon-shapes.ts";

  let { icon, size }: { icon: string; size: number } = $props();

  const shape = $derived(iconShape(icon));
</script>

{#if shape}
  <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={shape} /></svg>
{:else}
  <span class="emoji" style:font-size="{size}px" aria-hidden="true">{icon}</span>
{/if}

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .emoji {
    flex: none;
    overflow: hidden;
    unicode-bidi: isolate;
    line-height: 1;
  }
</style>
