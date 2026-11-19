<script lang="ts" module>
  export interface Segment<V extends string> {
    value: V;
    label: string;
    /** A colour dot before the label. */
    dot?: string;
    /** A second, smaller line. */
    detail?: string;
  }
</script>

<script lang="ts" generics="T extends string">
  let {
    value,
    options,
    label,
    wrap = false,
    onchange,
  }: {
    value: T;
    options: readonly Segment<T>[];
    label: string;
    /** Buttons flow onto several lines instead of sharing one. */
    wrap?: boolean;
    onchange: (value: T) => void;
  } = $props();
</script>

<div class="segmented" class:wrap role="radiogroup" aria-label={label} style:--count={options.length}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      onclick={() => option.value !== value && onchange(option.value)}
    >
      <span class="line">
        {#if option.dot}<span class="dot" style:background={option.dot} aria-hidden="true"></span>{/if}
        {option.label}
      </span>
      {#if option.detail}<span class="detail">{option.detail}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--bg);
  }
  .segmented.wrap {
    grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 44px;
    padding: 0 8px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  button[aria-checked="true"] {
    background: var(--surface-2);
    color: var(--text);
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .detail {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
</style>
