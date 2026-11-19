<script lang="ts">
  import { t } from "./lib/i18n.ts";
  import { chainLabel } from "./lib/chain-label.ts";
  import type { MyControls } from "./lib/controls.ts";

  let { controls, landscape }: { controls: MyControls; landscape: boolean } = $props();

  const MACRO_COUNT = 8;
  const MACRO_MAX = 127;
  const FLASH_MS = 1500;

  const panel = $derived(controls.panel);
  // Always 8 cells, so the band keeps its height whatever the rack holds.
  const cells = $derived(Array.from({ length: MACRO_COUNT }, (_, i) => panel?.macros[i] ?? null));
  const subtitle = $derived.by(() => {
    if (!panel) return t("musician.panelNotFound");
    if (panel.chain === undefined) return panel.rack;
    return panel.chain ? chainLabel(panel.chain) : t("musician.panelNoChain");
  });

  // Primitives: every macro value update brings a new focus object, and only a new touch should flash again.
  const touch = $derived(controls.focus.touch);
  const touched = $derived(controls.focus.macro);
  let flashed = $state<number | null>(null);
  $effect(() => {
    const macro = touched;
    flashed = null;
    if (macro === null || touch === 0) return;
    flashed = macro;
    const timer = setTimeout(() => (flashed = null), FLASH_MS);
    return () => clearTimeout(timer);
  });
</script>

<section class="controls" class:landscape aria-label={t("musician.panelMacros", { track: controls.focus.track })}>
  <header>
    <strong>{controls.focus.track}</strong>
    <span class="sub">{subtitle}</span>
  </header>
  <ol class="macros">
    {#each cells as macro, i (i)}
      <li class="macro" class:flash={flashed === i + 1} class:empty={!macro} class:overridden={macro?.overridden}>
        {#if macro}
          <span class="name" title={macro.overridden ? t("musician.macroOverridden", { name: macro.name }) : macro.name}>{macro.name}</span>
          <span class="meter" aria-hidden="true"><span class="level" style:width="{(macro.value / MACRO_MAX) * 100}%"></span></span>
          <span class="value">{macro.value}</span>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .controls {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
    padding: 6px;
    box-sizing: border-box;
    border-radius: var(--radius-cell);
    background: var(--surface);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
  }
  .sub {
    overflow: hidden;
    color: var(--muted);
    font-weight: 600;
    text-overflow: ellipsis;
  }
  .macros {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .landscape .macros {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
  .macro {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "name value"
      "meter meter";
    align-items: center;
    gap: 3px 4px;
    height: 36px;
    padding: 4px 6px;
    box-sizing: border-box;
    border-radius: 4px;
    background: var(--surface-2);
    transition: background-color 0.4s ease-out;
  }
  .macro.empty {
    background: var(--empty);
  }
  .macro.flash {
    background: var(--accent);
    color: var(--on-accent);
    transition: none;
  }
  /* Live's own cue for an overridden automation is orange: same colour, so it reads the same. */
  .overridden {
    box-shadow: inset 0 0 0 1px var(--setting);
  }
  .name {
    grid-area: name;
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value {
    grid-area: value;
    font-family: var(--font-mono);
    font-size: 11px;
    opacity: 0.8;
  }
  .meter {
    grid-area: meter;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .level {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .flash .meter {
    background: color-mix(in srgb, var(--on-accent) 30%, transparent);
  }
  .flash .level {
    background: var(--on-accent);
  }
  @media (prefers-reduced-motion: reduce) {
    .macro {
      transition: none;
    }
  }
</style>
