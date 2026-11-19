import { describe, expect, test } from "vitest";
import { parseChainClip } from "./clip-chain.ts";

describe("parseChainClip", () => {
  test("reads the chain and rack of a ClyphX take name", () => {
    expect(parseChainClip('[CHAIN_7] "SAX 1"/DEV("Sax Rack") B2 P8 7')).toEqual({ number: 7, rack: "Sax Rack" });
  });

  test("keeps the number when the rack is not given", () => {
    expect(parseChainClip("[CHAIN_3] B2 P8 3")).toEqual({ number: 3, rack: null });
  });

  test("ignores chain 0 and ordinary names", () => {
    expect(parseChainClip('[CHAIN_0] "A"/DEV("R") B2 P8 0')).toBeNull();
    expect(parseChainClip("Bass loop")).toBeNull();
  });
});
