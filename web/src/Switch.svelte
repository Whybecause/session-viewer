<script lang="ts">
  let {
    checked,
    label,
    disabled = false,
    onchange,
  }: { checked: boolean; label: string; disabled?: boolean; onchange: (checked: boolean) => void } = $props();
</script>

<!-- A real checkbox, drawn as a switch: keyboard and screen readers keep working. -->
<input
  type="checkbox"
  class="switch"
  aria-label={label}
  {checked}
  {disabled}
  onchange={(e) => onchange(e.currentTarget.checked)}
/>

<style>
  .switch {
    flex: none;
    position: relative;
    width: 52px;
    height: 32px;
    margin: 0;
    border-radius: 999px;
    background: var(--switch-off);
    appearance: none;
    cursor: pointer;
    transition: background 0.18s;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
    transition: transform 0.18s;
  }
  .switch:checked {
    background: var(--accent);
  }
  .switch:checked::after {
    transform: translateX(20px);
  }
  .switch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
