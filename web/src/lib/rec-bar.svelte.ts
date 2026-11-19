import { readStored, writeStored } from "./stored.ts";

// Per device, like the family: a phone short on rows can give the bar's height back to the clips.
const STORAGE_KEY = "session-viewer:rec-bar";

class RecBar {
  shown = $state(readStored(STORAGE_KEY) !== "off");
}

export const recBar = new RecBar();

export function setRecBarShown(shown: boolean): void {
  recBar.shown = shown;
  writeStored(STORAGE_KEY, shown ? null : "off");
}
