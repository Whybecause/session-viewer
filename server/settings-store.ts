import type { Settings } from "./protocol.ts";
import { saveSettings } from "./settings.ts";

/** Holds the live settings and writes them to disk after changes settle, so bursts cost one write. */
export class SettingsStore {
  private value: Settings;
  private timer: NodeJS.Timeout | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    initial: Settings,
    private readonly delayMs = 300,
    private readonly onFailedWrite: (err: Error) => void = () => undefined,
  ) {
    this.value = initial;
  }

  get current(): Settings {
    return this.value;
  }

  set(next: Settings): void {
    this.value = next;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.write(), this.delayMs);
  }

  /** Writes any pending change now; call before exiting. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.write();
    }
    await this.writing;
  }

  private write(): Promise<void> {
    this.timer = undefined;
    this.writing = this.writing
      .then(() => saveSettings(this.path, this.value))
      .catch((err: Error) => {
        console.error("[settings] save failed:", err.message);
        this.onFailedWrite(err);
      });
    return this.writing;
  }
}
