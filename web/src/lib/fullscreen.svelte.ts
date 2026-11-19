import { readStored, writeStored } from "./stored.ts";

// Per device: a musician who hid the toolbar keeps it hidden after the phone locks and the page reloads.
const STORAGE_KEY = "session-viewer:fullscreen";

// iPhone has no fullscreen API for pages: there, the home screen icon hides Safari and this only hides the toolbar.
const hasFullscreenApi = typeof document !== "undefined" && document.fullscreenEnabled;

class Fullscreen {
  on = $state(!hasFullscreenApi && readStored(STORAGE_KEY) === "1");
}

export const fullscreen = new Fullscreen();

// The back gesture and the screen lock leave fullscreen without the button: the toolbar must come back with it.
if (hasFullscreenApi) {
  document.addEventListener("fullscreenchange", () => (fullscreen.on = document.fullscreenElement !== null));
}

export function toggleFullscreen(): void {
  const on = !fullscreen.on;
  fullscreen.on = on;
  if (!hasFullscreenApi) return writeStored(STORAGE_KEY, on ? "1" : null);
  // A refusal still leaves the toolbar hidden, the most this device then allows.
  if (on) document.documentElement.requestFullscreen().catch((err: Error) => console.warn("[fullscreen]", err.message));
  else if (document.fullscreenElement) void document.exitFullscreen();
}
