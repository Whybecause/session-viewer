import { cpSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("../node_modules/ableton-js/midi-script", import.meta.url));
const SKIPPED = /[\\/](_Framework|__pycache__|\.ruff_cache)([\\/]|$)|\.pyc$/;

const defaultLibrary = () =>
  join(homedir(), process.platform === "win32" ? "Documents/Ableton/User Library" : "Music/Ableton/User Library");

const library = resolve(process.argv[2] ?? process.env.ABLETON_USER_LIBRARY ?? defaultLibrary());

if (!existsSync(SOURCE)) {
  console.error("ableton-js is not installed: run npm install first.");
  process.exit(1);
}
// Never create the folder: a wrong path would "succeed" in a place Live does not read.
if (!existsSync(library)) {
  console.error(
    `User Library not found: ${library}\n` +
      `If yours is elsewhere (see Library in Live's settings), pass it: npm run setup:live -- "/path/to/User Library"`,
  );
  process.exit(1);
}

const target = join(library, "Remote Scripts", "AbletonJS");
rmSync(target, { recursive: true, force: true });
cpSync(SOURCE, target, { recursive: true, filter: (path) => !SKIPPED.test(path) });
console.log(
  `AbletonJS installed in ${target}\n` +
    "In Live: Settings > Link, Tempo & MIDI > Control Surface > AbletonJS (restart Live if it is not listed).",
);
