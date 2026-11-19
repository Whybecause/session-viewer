<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<label class="field">
  <span class="field-label">{label}</span>
  {@render children()}
</label>

<style>
  .field {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  .field-label {
    color: var(--muted);
    font-size: 13px;
  }
</style>
