<script lang="ts">
  import { t, plural } from "./lib/i18n.ts";

  let { count, error, onsave, oncancel }: { count: number; error: string; onsave: () => void; oncancel: () => void } = $props();
</script>

<div class="bar" role="region" aria-label={t("settings.saveBarLabel")}>
  <span class="text">
    {#if error}<span class="error" role="alert">{error}</span>{:else}{plural("settings.changesSavedFor", count)}{/if}
  </span>
  <button type="button" class="cancel" onclick={oncancel}>{t("common.cancel")}</button>
  <button type="button" class="save" onclick={onsave}>{t("common.save")}</button>
</div>

<style>
  .bar {
    position: sticky;
    bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    padding: 10px 10px 10px 16px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface-2);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  }
  .text {
    flex: 1;
    min-width: 0;
    font-size: 13px;
  }
  .error {
    color: var(--setting);
  }
  button {
    height: 44px;
    border: 0;
    border-radius: 12px;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .cancel {
    padding: 0 14px;
    background: transparent;
    color: var(--text);
  }
  .save {
    padding: 0 18px;
    background: var(--accent);
    color: var(--on-accent);
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
