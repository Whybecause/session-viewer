<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    onClose,
    children,
    footer,
  }: { title: string; onClose: () => void; children: Snippet; footer: Snippet } = $props();

  // Past either, a downward swipe closes the sheet; short of both, it springs back.
  const DISMISS_DISTANCE_PX = 90;
  const DISMISS_SPEED_PX_PER_MS = 0.6;
  const CLOSE_ANIMATION_MS = 180;

  let dialog: HTMLDialogElement | undefined = $state();
  let body: HTMLDivElement | undefined = $state();
  let dragY = $state(0);
  let isDragging = $state(false);
  let isClosing = $state(false);
  const titleId = `sheet-${Math.random().toString(36).slice(2)}`;

  // Mounted only while shown: the parent's {#if} opens it, and closing hands control back through onClose.
  $effect(() => {
    dialog?.showModal();
    // showModal would focus the close button and ring it; the sheet itself takes focus, which also keeps a
    // phone keyboard down.
    dialog?.focus();
  });

  export function close(): void {
    dialog?.close();
  }

  function dismiss() {
    isClosing = true;
    setTimeout(close, CLOSE_ANIMATION_MS);
  }

  /**
   * Swipe down to close, like a native sheet. Only from the header, or from the content while it is scrolled to the
   * top: elsewhere the swipe scrolls the content. Taking the gesture also keeps it from reaching the page, where the
   * browser would turn it into a pull-to-refresh.
   */
  $effect(() => {
    const el = dialog;
    if (!el) return;
    let startY = 0;
    let startTime = 0;
    let canDrag = false;

    const start = (event: TouchEvent) => {
      // A popover list scrolls itself: a swipe inside it must not drag the sheet.
      const inList = (event.target as Element).closest?.("[popover]") != null;
      canDrag = event.touches.length === 1 && !inList && (!body?.contains(event.target as Node) || body.scrollTop <= 0);
      startY = event.touches[0].clientY;
      startTime = event.timeStamp;
    };
    const move = (event: TouchEvent) => {
      if (!canDrag) return;
      const dy = event.touches[0].clientY - startY;
      if (!isDragging && dy < 0) {
        canDrag = false;
        return;
      }
      if (dy <= 0 && !isDragging) return;
      event.preventDefault();
      isDragging = true;
      dragY = Math.max(0, dy);
    };
    const end = (event: TouchEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const speed = dragY / Math.max(1, event.timeStamp - startTime);
      if (dragY > DISMISS_DISTANCE_PX || speed > DISMISS_SPEED_PX_PER_MS) dismiss();
      else dragY = 0;
    };

    el.addEventListener("touchstart", start, { passive: true });
    // Not passive: preventDefault is what stops the content bounce and the pull-to-refresh.
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  });
</script>

<!-- The click is a pointer shortcut: Escape and the close button already do this for the keyboard. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  tabindex="-1"
  onclose={onClose}
  onclick={(event) => event.target === dialog && dismiss()}
  class:dragging={isDragging}
  class:closing={isClosing}
  style:--close-ms="{CLOSE_ANIMATION_MS}ms"
  style:transform={isClosing ? "translateY(100%)" : dragY > 0 ? `translateY(${dragY}px)` : undefined}
>
  <header>
    <span class="grabber" aria-hidden="true"></span>
    <h2 id={titleId}>{title}</h2>
    <button type="button" class="close" aria-label="Fermer" onclick={close}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>
  <div class="body" bind:this={body}>{@render children()}</div>
  <footer>{@render footer()}</footer>
</dialog>

<style>
  /* A bottom sheet on phones, a centered panel on wider screens. */
  dialog {
    box-sizing: border-box;
    width: 100%;
    max-width: 480px;
    max-height: 90dvh;
    margin: auto auto 0;
    padding: 0;
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: 20px 20px 0 0;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 -12px 40px rgb(0 0 0 / 0.5);
    overflow: hidden;
    animation: sheet-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
    transition: transform var(--close-ms) ease-out;
  }
  /* Follows the finger exactly while dragged. */
  dialog.dragging {
    transition: none;
  }
  /* Only when open: a plain `display` here would beat the browser's rule that hides a closed dialog. */
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog:focus {
    outline: none;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
    backdrop-filter: blur(2px);
  }
  @media (min-width: 640px) {
    dialog {
      margin: auto;
      border-bottom: 1px solid var(--border);
      border-radius: 20px;
    }
    .grabber {
      display: none;
    }
  }
  @media (min-width: 1000px) and (min-height: 700px) {
    dialog {
      max-width: 820px;
      max-height: 88dvh;
    }
  }
  @keyframes sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  header {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 22px 56px 12px 20px;
  }
  .grabber {
    position: absolute;
    top: 7px;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  h2 {
    margin: 0;
    overflow: hidden;
    font-size: 17px;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .close {
    position: absolute;
    right: 12px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    cursor: pointer;
  }
  .close svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  /* Sized by its content and shrinking past the sheet's max height: Safari collapses a flex: 1 child to nothing
     in a column whose height is only capped, leaving just the header and the buttons. */
  .body {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 16px 12px;
  }
  footer {
    flex: none;
    padding: 12px 16px max(16px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }

  /* The shared vocabulary of every sheet: section titles, cards of rows, footer buttons. */
  .body :global(section + section) {
    margin-top: 20px;
  }
  .body :global(h3) {
    margin: 0 0 8px 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .body :global(.card) {
    border-radius: var(--radius-panel);
    background: var(--surface-2);
    overflow: hidden;
  }
  .body :global(.card + .card) {
    margin-top: 10px;
  }
  .body :global(.row) {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 10px 14px;
  }
  .body :global(.row + .row) {
    border-top: 1px solid rgb(255 255 255 / 0.07);
  }
  .body :global(.row.stacked) {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .body :global(.label) {
    font-size: 15px;
    font-weight: 500;
  }
  .body :global(.sub) {
    color: var(--muted);
    font-size: 13px;
  }
  footer :global(.error) {
    margin: 0 0 10px;
    color: var(--rec);
    font-size: 14px;
  }
  footer :global(.actions) {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 10px;
  }
  footer :global(.actions button) {
    min-height: 48px;
    padding: 0 12px;
    border: 0;
    border-radius: 12px;
    font: inherit;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }
  footer :global(.ghost) {
    background: var(--surface-2);
    color: var(--text);
  }
  footer :global(.primary) {
    background: var(--accent);
    color: var(--on-accent);
  }
  footer :global(.primary:active) {
    filter: brightness(0.92);
  }
  footer :global(button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }
  dialog :global(button:focus-visible),
  dialog :global(input:focus-visible),
  dialog :global(select:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
