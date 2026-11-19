<script lang="ts">
  import { t } from "./lib/i18n.ts";
  import { qrPath } from "./lib/qr.ts";
  import { connection } from "./lib/session.svelte.ts";
  import Segmented from "./Segmented.svelte";
  import Sheet from "./Sheet.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const COPIED_MS = 1500;
  const QR_MARGIN = 2;

  let sheet: Sheet | undefined = $state();
  let chosen = $state<string | null>(null);
  let isCopied = $state(false);
  let addressInput: HTMLInputElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const urls = $derived(connection.serverUrls);
  const url = $derived(chosen !== null && urls.includes(chosen) ? chosen : (urls[0] ?? location.origin));
  const qr = $derived(qrPath(url));
  const networks = $derived(urls.map((u, i) => ({ value: u, label: t("settings.networkOption", { index: i + 1 }), detail: new URL(u).hostname })));

  // Served over plain HTTP on the LAN: navigator.clipboard is missing outside a secure context, execCommand is not.
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      addressInput?.select();
      if (!document.execCommand("copy")) return;
    }
    isCopied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (isCopied = false), COPIED_MS);
  }
</script>

<Sheet bind:this={sheet} title={t("settings.connectSheetTitle")} {onClose}>
  <div class="connect">
    <p class="help">{t("settings.connectSheetHelp")}</p>
    <svg
      class="qr"
      role="img"
      aria-label="QR code de l'adresse {url}"
      viewBox="{-QR_MARGIN} {-QR_MARGIN} {qr.size + 2 * QR_MARGIN} {qr.size + 2 * QR_MARGIN}"
      shape-rendering="crispEdges"
    >
      <rect x={-QR_MARGIN} y={-QR_MARGIN} width={qr.size + 2 * QR_MARGIN} height={qr.size + 2 * QR_MARGIN} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
    {#if networks.length > 1}
      <div class="networks">
        <span class="title">{t("settings.networkLabel")}</span>
        <Segmented label={t("settings.networkLabel")} value={url} options={networks} onchange={(next) => ((chosen = next), (isCopied = false))} />
      </div>
    {/if}
    <div class="address">
      <input bind:this={addressInput} readonly value={url} aria-label={t("settings.addressLabel")} onfocus={(e) => e.currentTarget.select()} />
      <button type="button" onclick={copy}>{isCopied ? t("settings.copied") : t("settings.copy")}</button>
    </div>
  </div>
  {#snippet footer()}
    <div class="actions single"><button type="button" class="ghost" onclick={() => sheet?.close()}>{t("common.close")}</button></div>
  {/snippet}
</Sheet>

<style>
  .connect {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .help {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.45;
  }
  .qr {
    align-self: center;
    width: 240px;
    height: 240px;
    border-radius: 24px;
  }
  .networks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .address {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: 14px;
    background: var(--bg);
  }
  .address input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 15px;
  }
  .address button {
    height: 44px;
    padding: 0 16px;
    border: 0;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  :global(.actions.single) {
    grid-template-columns: 1fr !important;
  }
</style>
