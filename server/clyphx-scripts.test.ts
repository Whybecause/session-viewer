import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { recLengthDir, recLengthWriters } from "./clyphx-scripts.ts";

describe("recLengthDir", () => {
  test("reads the expanded folder of the VIEWER_REC_LEN_DIR line", () => {
    const source = 'import os\nVIEWER_REC_LEN_DIR = os.path.expanduser("~/dev/session-viewer/data/rec-length")\n';
    expect(recLengthDir(source)).toBe(join(homedir(), "dev/session-viewer/data/rec-length"));
  });

  test("is null when the line is missing or written another way", () => {
    expect(recLengthDir("VIEWER_REC_LEN_DIR = '/tmp/x'")).toBeNull();
    expect(recLengthDir("# nothing here")).toBeNull();
  });
});

const SCRIPTS = ["rec_writer.py", "other_writer.py"];

describe("recLengthWriters", () => {
  test("tells which scripts write where the app reads, and skips the missing ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clyphx-"));
    const own = join(dir, "data/rec-length/");
    await writeFile(join(dir, "rec_writer.py"), `VIEWER_REC_LEN_DIR = os.path.expanduser("${join(dir, "data/rec-length")}")`);
    expect(await recLengthWriters(own, dir, SCRIPTS)).toEqual([
      { script: "rec_writer.py", dir: join(dir, "data/rec-length"), isOurs: true },
    ]);
    await writeFile(join(dir, "other_writer.py"), 'VIEWER_REC_LEN_DIR = os.path.expanduser("~/elsewhere")');
    expect((await recLengthWriters(own, dir, SCRIPTS)).map((w) => w.isOurs)).toEqual([true, false]);
  });

  test("checks nothing when no script is named", async () => {
    expect(await recLengthWriters("/data", "/nowhere", [])).toEqual([]);
  });
});
