import type { Clip } from "ableton-js/ns/clip";
import { describe, expect, test } from "vitest";
import { readClipLength } from "./live-read.ts";
import { makeClip } from "./testing/fake-live.ts";

const asClip = (props: Record<string, unknown>, raw: Record<string, unknown> = {}): Clip => {
  const clip = makeClip("c");
  Object.assign(clip.props, props);
  Object.assign(clip.raw, raw);
  return clip as unknown as Clip;
};

describe("readClipLength", () => {
  test("counts bars with the clip's own signature, to the quarter bar", async () => {
    expect(await readClipLength(asClip({ length: 12, signature_numerator: 3, signature_denominator: 4 }))).toBe(4);
    expect(await readClipLength(asClip({ length: 10 }))).toBe(2.5);
  });
  test("is unknown for the placeholder length Live gives a clip being recorded", async () => {
    expect(await readClipLength(asClip({ length: 63_072_000 }))).toBeUndefined();
  });
  test("is unknown for unwarped audio, whose length Live gives in seconds", async () => {
    expect(await readClipLength(asClip({ warping: false }, { is_audio_clip: true }))).toBeUndefined();
  });
});
