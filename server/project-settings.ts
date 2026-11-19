import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const SETTINGS_FOLDER = "SessionViewer";
// Live creates it at the root of every project; a set saved in Backup/ sits one level below.
const PROJECT_MARKER = "Ableton Project Info";
const MAX_LEVELS_UP = 2;

/** The project folder of a set: the closest folder above it that Live marked, else the set's own folder. */
export function projectRoot(setPath: string, isProject = (dir: string) => existsSync(join(dir, PROJECT_MARKER))): string {
  let dir = dirname(setPath);
  for (let level = 0; level < MAX_LEVELS_UP; level++) {
    if (isProject(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(setPath);
}

export interface SettingsLocation {
  path: string;
  /** Folder name shown to phones; null for the settings shared by unsaved sets. */
  project: string | null;
}

/** One settings file per Live project, shared by every set in it; a set never saved uses the global one. */
export function settingsLocation(setPath: string, globalPath: string, isProject?: (dir: string) => boolean): SettingsLocation {
  if (!setPath) return { path: globalPath, project: null };
  const root = projectRoot(setPath, isProject);
  return { path: join(root, SETTINGS_FOLDER, "settings.json"), project: basename(root) };
}
