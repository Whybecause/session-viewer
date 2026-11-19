import { describe, expect, test } from "vitest";
import { projectRoot, settingsLocation } from "./project-settings.ts";

const projects = (...dirs: string[]) => (dir: string) => dirs.includes(dir);

describe("projectRoot", () => {
  test("is the set's folder when Live marked it", () => {
    expect(projectRoot("/m/Jam Project/Jam.als", projects("/m/Jam Project"))).toBe("/m/Jam Project");
  });

  test("climbs out of Backup to the project", () => {
    expect(projectRoot("/m/Jam Project/Backup/Jam [2026].als", projects("/m/Jam Project"))).toBe("/m/Jam Project");
  });

  test("falls back to the set's folder, never wandering far up", () => {
    expect(projectRoot("/m/a/b/c/Jam.als", projects("/m"))).toBe("/m/a/b/c");
    expect(projectRoot("/Jam.als", projects())).toBe("/");
  });
});

describe("settingsLocation", () => {
  const marked = projects("/m/Jam Project");

  test("puts every set of a project on one file in its SessionViewer folder", () => {
    const expected = { path: "/m/Jam Project/SessionViewer/settings.json", project: "Jam Project" };
    expect(settingsLocation("/m/Jam Project/Jam.als", "/g.json", marked)).toEqual(expected);
    expect(settingsLocation("/m/Jam Project/Jam v2.als", "/g.json", marked)).toEqual(expected);
  });

  test("uses the global file for a set never saved", () => {
    expect(settingsLocation("", "/g.json", marked)).toEqual({ path: "/g.json", project: null });
  });
});
