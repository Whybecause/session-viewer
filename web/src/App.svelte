<script lang="ts">
  import { onMount } from "svelte";
  import { DEFAULT_SETTINGS } from "../../server/protocol.ts";
  import SessionGrid from "./SessionGrid.svelte";
  import { connect, connection } from "./lib/session.svelte.ts";
  import { holdWakeLock } from "./lib/wake-lock.ts";
  import { t } from "./lib/i18n.ts";

  onMount(connect);

  // A grid nobody can read in the dark is worse than none: the screen stays on while the server is reachable.
  $effect(() => (connection.serverConnected ? holdWakeLock() : undefined));

  // A home screen app shows no address bar: the banner names the address it was installed from, which may belong to
  // another network. The attempt count tells a slow reconnection from a stuck one.
  const status = $derived(
    !connection.serverConnected
      ? t("grid.serverUnreachablePrefix", { host: location.host, attempt: connection.attempt }) +
        (connection.lastFailure ? t("grid.lastFailurePrefix", { reason: connection.lastFailure }) : "") + ")"
      : connection.message && !connection.message.liveConnected
        ? t("grid.liveUnreachable")
        : null,
  );
</script>

{#if status}
  <div class="banner" role="status">
    {status}
    <!-- A home screen app has no reload button of its own. -->
    {#if !connection.serverConnected}
      <button type="button" class="reload" onclick={() => location.reload()}>{t("grid.reload")}</button>
    {/if}
  </div>
{/if}

{#if connection.notice}
  <div class="banner notice" role="status">{connection.notice}</div>
{/if}

<main class:stale={status !== null}>
  {#if connection.message && connection.message.session.tracks.length > 0}
    <SessionGrid
      session={connection.message.session}
      times={connection.time}
      tempo={connection.tempo}
      transport={connection.transport}
      settings={connection.settings ?? DEFAULT_SETTINGS}
      recLengths={connection.recLengths}
      recTakes={connection.recTakes}
      controls={connection.controls}
      recLengthWriters={connection.recLengthWriters}
    />
  {:else}
    <p class="empty">{connection.message ? t("grid.noTracks") : t("grid.connecting")}</p>
  {/if}
</main>

<style>
  /* Latin subsets of the Inter and JetBrains Mono variable fonts, served by this server: no internet on stage. */
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url("/fonts/inter-latin.woff2") format("woff2");
  }
  @font-face {
    font-family: "JetBrains Mono";
    font-style: normal;
    font-weight: 100 800;
    font-display: swap;
    src: url("/fonts/jetbrains-mono-latin.woff2") format("woff2");
  }
  :global(:root) {
    --bg: #111214;
    --surface: #1a1b1f;
    --surface-2: #202226;
    --border: #26282d;
    --line: #3a3d44;
    --text: #ececec;
    --muted: #a4a7ad;
    --accent: #4ade80;
    --rec: #e5484d;
    --overdub: var(--rec);
    --on-overdub: #fff;
    --no-notes: var(--muted);
    --on-no-notes: var(--bg);
    --fx: #38d6e8;
    --setting: #f2b55a;
    --on-setting: #1a1306;
    --danger: #f87171;
    --on-accent: #06210f;
    --switch-off: #4a4a4e;
    --empty: #17181b;
    --empty-dot: #2c2e33;
    --row-active: #1f2125;
    --beat-past: #4a4d54;
    --beat-next: #2a2c31;
    --banner-error: #7c2d12;
    --banner-notice: #1e3a5f;
    --font-text: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
    --radius-cell: 6px;
    --radius-panel: 12px;
    color-scheme: dark;
  }
  @keyframes -global-blink {
    to {
      opacity: 0.35;
    }
  }
  @keyframes -global-pulse {
    50% {
      opacity: 0.6;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation: none !important;
      transition: none !important;
    }
  }
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.35 var(--font-text);
    -webkit-tap-highlight-color: transparent;
  }
  /* No pull-to-refresh behind an open sheet: swiping it down to close must never reload the page instead. */
  :global(html:has(dialog[open]), html:has(dialog[open]) body) {
    overscroll-behavior-y: none;
  }
  .banner {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 10px 16px;
    background: var(--banner-error);
    color: #fff;
    font-weight: 600;
    text-align: center;
  }
  .notice {
    background: var(--banner-notice);
  }
  .reload {
    margin-left: 10px;
    padding: 4px 12px;
    border: 1px solid rgb(255 255 255 / 0.6);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  /* From the home screen the page runs under the status bar and the notch: banner and grid both start below it. */
  :global(#app) {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100dvh;
    padding-top: env(safe-area-inset-top);
  }
  main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
    transition: opacity 0.2s;
  }
  @media (max-width: 480px) {
    main {
      padding: 8px max(6px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom))
        max(6px, env(safe-area-inset-left));
    }
  }
  /* Frozen data that looks alive is the worst case on stage: grey and dim says it is not. */
  main.stale {
    opacity: 0.45;
    filter: grayscale(1);
  }
  .empty {
    color: var(--muted);
    text-align: center;
    margin-top: 30vh;
  }
</style>
