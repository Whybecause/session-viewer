<script lang="ts">
  import { t } from "./lib/i18n.ts";

  export interface Tab {
    name: string;
    color: string;
  }

  let {
    tabs,
    active,
    mine,
    onSelect,
  }: {
    tabs: Tab[];
    /** The tab whose tracks are on screen. */
    active: string | null;
    /** This device's musician. */
    mine: string | null;
    onSelect: (name: string) => void;
  } = $props();
</script>

{#if tabs.length > 0}
  <nav class="families" aria-label={t("musician.familyNav")}>
    {#each tabs as tab (tab.name)}
      <button
        type="button"
        style:--family-color={tab.color}
        class:active={tab.name === active}
        aria-pressed={tab.name === active}
        onclick={() => onSelect(tab.name)}
        ><span class="dot" aria-hidden="true"></span>{tab.name}{#if tab.name === mine}<span class="me">{t("musician.familyMe")}</span>{/if}</button
      >
    {/each}
  </nav>
{/if}

<style>
  .families {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    background: var(--surface);
    overflow-x: auto;
    scrollbar-width: none;
  }
  button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  button.active {
    background: var(--text);
    color: var(--bg);
    font-weight: 700;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--family-color);
  }
  .me {
    padding: 0 3px;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-size: 9px;
    font-weight: 600;
    line-height: 14px;
  }
  button.active .me {
    border-color: color-mix(in srgb, var(--bg) 40%, transparent);
    color: var(--bg);
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
