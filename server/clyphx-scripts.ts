import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { RecLengthWriter } from "./protocol.ts";

export const DEFAULT_SCRIPTS_DIR = join(homedir(), "Music/Ableton/User Library/Remote Scripts/_user_actions");
const DIR_LINE = /^VIEWER_REC_LEN_DIR\s*=\s*os\.path\.expanduser\(\s*["']([^"']+)["']\s*\)/m;

const expandHome = (path: string): string => (path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path);

/** The folder a script writes the rec lengths to; null when its VIEWER_REC_LEN_DIR line is not the expected form. */
export function recLengthDir(source: string): string | null {
  const match = DIR_LINE.exec(source);
  return match ? resolve(expandHome(match[1])) : null;
}

/** Scripts missing from this machine are left out: the app also runs where the set does not. */
export async function recLengthWriters(ownDir: string, scriptsDir: string, scripts: readonly string[]): Promise<RecLengthWriter[]> {
  const found = await Promise.all(
    scripts.map(async (script): Promise<RecLengthWriter[]> => {
      try {
        const dir = recLengthDir(await readFile(join(scriptsDir, script), "utf8"));
        return [{ script, dir, isOurs: dir === resolve(ownDir) }];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[clyphx] cannot read ${script}:`, (err as Error).message);
        return [];
      }
    }),
  );
  return found.flat();
}
