<script lang="ts">
  export interface Choice {
    value: string;
    label: string;
  }

  let {
    value = $bindable(),
    options,
    label,
    invalid = false,
    onchange,
  }: {
    value: string;
    options: readonly Choice[];
    /** What a screen reader calls it: the button only shows the current choice. */
    label: string;
    /** Draws it as needing attention, e.g. a track that is no longer in the set. */
    invalid?: boolean;
    onchange?: (value: string) => void;
  } = $props();

  const EDGE_PX = 8;
  const MAX_LIST_PX = 320;

  const listId = $props.id();
  let trigger: HTMLButtonElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  let isOpen = $state(false);

  // Two tracks can share a name: the first one is the selection, as everywhere else that resolves a name.
  const selectedIndex = $derived(options.findIndex((o) => o.value === value));
  const current = $derived(options[selectedIndex]);

  // Fixed to the trigger, in the top layer: the settings cards clip anything that overflows them.
  function place() {
    if (!trigger || !list) return;
    const box = trigger.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - EDGE_PX;
    const above = box.top - EDGE_PX;
    const opensUp = below < Math.min(MAX_LIST_PX, 200) && above > below;
    const width = Math.max(box.width, 180);
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(EDGE_PX, Math.min(box.left, window.innerWidth - width - EDGE_PX))}px`;
    list.style.maxHeight = `${Math.min(MAX_LIST_PX, opensUp ? above : below)}px`;
    list.style.top = opensUp ? "auto" : `${box.bottom + 4}px`;
    list.style.bottom = opensUp ? `${window.innerHeight - box.top + 4}px` : "auto";
  }

  // Before it shows, so the list never appears for a frame at its default spot.
  function onBeforeToggle(event: Event) {
    if ((event as ToggleEvent).newState === "open") place();
  }

  function onToggle(event: Event) {
    isOpen = (event as ToggleEvent).newState === "open";
    if (!isOpen) return;
    // Once the options are drawn: the current one first, so a long list opens where the choice is.
    requestAnimationFrame(() => {
      const target = list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>("button");
      target?.focus();
    });
  }

  function choose(next: string) {
    list?.hidePopover();
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function onKeydown(event: KeyboardEvent) {
    const items = [...(list?.querySelectorAll<HTMLElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to: Record<string, number> = {
      ArrowDown: Math.min(at + 1, items.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in to)) return;
    event.preventDefault();
    items[to[event.key]]?.focus();
  }
</script>

<!-- A list placed once would be stale after a rotation: closing is simpler than following it. -->
<svelte:window onresize={() => isOpen && list?.hidePopover()} />

<button
  bind:this={trigger}
  type="button"
  class="trigger"
  class:invalid
  aria-label="{label} : {current?.label ?? value}"
  aria-haspopup="listbox"
  aria-expanded={isOpen}
  aria-controls={listId}
  popovertarget={listId}
>
  <span class="text">{current?.label ?? value}</span>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
</button>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div bind:this={list} id={listId} class="list" popover="auto" role="listbox" aria-label={label} onbeforetoggle={onBeforeToggle} ontoggle={onToggle} onkeydown={onKeydown}>
  {#if isOpen}
    {#each options as option, i (i)}
      <button type="button" role="option" aria-selected={i === selectedIndex} onclick={() => choose(option.value)}>
        <span class="option-text">{option.label}</span>
        {#if i === selectedIndex}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>{/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }
  .trigger.invalid {
    border-style: dashed;
    border-color: var(--setting);
    color: var(--setting);
  }
  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .trigger svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .list {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 4px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--surface-2);
    color: var(--text);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .list:not(:popover-open) {
    display: none;
  }
  .list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }
  .list button[aria-selected="true"] {
    color: var(--accent);
    font-weight: 600;
  }
  .list button:hover,
  .list button:focus-visible {
    background: var(--surface);
    outline: none;
  }
  .list svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .option-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
