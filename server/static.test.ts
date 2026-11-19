import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entryScript, parseRange, resolveInside } from "./static.ts";

describe("parseRange", () => {
  test.each([
    ["bytes=0-1", { start: 0, end: 1 }],
    ["bytes=10-", { start: 10, end: 99 }],
    ["bytes=-20", { start: 80, end: 99 }],
    ["bytes=90-500", { start: 90, end: 99 }],
  ])("reads %s", (header, expected) => {
    expect(parseRange(header, 100)).toEqual(expected);
  });

  test.each([undefined, "bytes=-", "bytes=100-", "bytes=5-2", "bytes=0-1,5-6", "items=0-1"])(
    "is null for %s",
    (header) => {
      expect(parseRange(header, 100)).toBeNull();
    },
  );
});

const ROOT = "/srv/app/web/dist";

describe("resolveInside", () => {
  test("maps the root to index.html", () => {
    expect(resolveInside(ROOT, "/")).toBe(`${ROOT}/index.html`);
  });

  test("resolves a nested asset", () => {
    expect(resolveInside(ROOT, "/assets/app.js")).toBe(`${ROOT}/assets/app.js`);
  });

  test.each(["/../package.json", "/../../etc/passwd", "/assets/../../data/settings.json", "//etc/passwd/../../../x"])(
    "refuses to leave the root with %s",
    (path) => {
      expect(resolveInside(ROOT, path)).toBeNull();
    },
  );

  test("refuses the root directory itself being replaced by a sibling with the same prefix", () => {
    expect(resolveInside(ROOT, "/../dist-secret/key")).toBeNull();
  });
});

describe("entryScript", () => {
  test("reads the fingerprinted entry script of the build", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dist-"));
    await writeFile(
      join(dir, "index.html"),
      '<head><script type="module" crossorigin src="/assets/index-Ab12.js"></script></head>',
    );
    expect(await entryScript(dir)).toBe("/assets/index-Ab12.js");
  });

  test("is null when nothing is built", async () => {
    expect(await entryScript(join(tmpdir(), "no-such-dist"))).toBeNull();
  });
});
