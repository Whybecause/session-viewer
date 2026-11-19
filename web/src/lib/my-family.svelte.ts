import { readStored, writeStored } from "./stored.ts";

// Per device on purpose: each musician's phone opens on their own tracks.
const STORAGE_KEY = "session-viewer:family";

class MyFamily {
  name = $state<string | null>(readStored(STORAGE_KEY));
}

export const myFamily = new MyFamily();

export function setMyFamily(name: string | null): void {
  myFamily.name = name;
  writeStored(STORAGE_KEY, name || null);
}
