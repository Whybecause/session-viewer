import { describe, expect, test } from "vitest";
import { Generation } from "./live-generation.ts";
import { TimingWatcher } from "./live-time.ts";
import { type WatchContext, watchSession } from "./live-watch.ts";
import type { ControlPanel } from "./protocol.ts";
import { type ControlsSink, type RackTarget } from "./rack-controls.ts";
import { LAUNCH_GRACE_MS, OVERRIDE_SETTLE_MS } from "./rack-watch.ts";
import { EMPTY_SESSION, type SessionModel } from "./session-state.ts";
import { type FakeObject, type FakeRack, type FakeWorld, buildWorld, makeRack } from "./testing/fake-live.ts";

interface Touch {
  musicians: readonly string[];
  track: string;
  macro: number | null;
}

function harness(world: FakeWorld, targets: RackTarget[], chainMacro = 16) {
  let currentId = 0;
  let model: SessionModel = EMPTY_SESSION;
  let panels: Record<string, ControlPanel> = {};
  const touches: Touch[] = [];
  const controls: ControlsSink = {
    reset: () => {
      panels = {};
    },
    setPanel: (panel) => {
      panels = { ...panels, [panel.track]: panel };
    },
    touch: (musicians, track, macro) => touches.push({ musicians, track, macro }),
  };
  const ctx: WatchContext = {
    ableton: world.ableton,
    timing: new TimingWatcher(world.ableton),
    model: () => model,
    scheduleReload: () => undefined,
    failLoad: () => () => undefined,
    cueSends: (names) => names.map(() => null),
    signalSend: () => null,
    racks: () => targets,
    chainMacro: () => chainMacro,
    controls,
  };
  const generation = new Generation(++currentId, () => currentId, (update) => {
    model = update(model);
  });
  return {
    ctx,
    generation,
    model: () => model,
    panel: (track = "bass 1") => panels[track],
    touches,
    supersede: () => {
      currentId += 1;
    },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const eventually = async (check: () => void) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return check();
    } catch {
      await wait(5);
    }
  }
  check();
};

const target = (patch: Partial<RackTarget>): RackTarget => ({
  track: "bass 1",
  rack: "BASS",
  label: false,
  mode: null,
  musicians: ["ALEX"],
  flags: [],
  ...patch,
});

/** "BASS" with two chains, each holding one inner rack, plus a panic device in front like the real set. */
function chainWorld(chain = 1): { world: FakeWorld; rack: FakeRack; acid: FakeRack; lead: FakeRack } {
  const world = buildWorld();
  const acid = makeRack("ACID");
  const lead = makeRack("LEAD");
  const panic = { raw: { name: "panic", class_name: "MxDeviceMidiEffect" } } as unknown as FakeObject;
  const rack = makeRack("BASS", {
    chain,
    chains: [
      { name: "1 ACID", devices: [panic, acid.device] },
      { name: "2 LEAD", devices: [lead.device] },
    ],
  });
  world.track.props.devices = [...(world.track.props.devices as FakeObject[]), rack.device];
  return { world, rack, acid, lead };
}

const names = (panel: ControlPanel | undefined) => panel?.macros.map((m) => m.name);

describe("rack mode", () => {
  test("shows the rack's macros 1-8 and follows their values and names", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [target({ mode: "rack" })]);
    await watchSession(h.generation, h.ctx);

    expect(names(h.panel())).toEqual(Array.from({ length: 8 }, (_, i) => `BASS m${i + 1}`));
    rack.params[2].emit("value", 63.6);
    rack.params[2].emit("name", "Cutoff");
    expect(h.panel()?.macros[1]).toEqual({ name: "Cutoff", value: 64 });
    expect(h.panel()?.chain).toBeUndefined();
  });

  test("a value that rounds to the one shown does not publish the panel again", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [target({ mode: "rack" })]);
    await watchSession(h.generation, h.ctx);

    const shown = h.panel();
    rack.params[1].emit("value", 10.3);
    expect(h.panel()).toBe(shown);
  });

  test("a turned knob moves the focus of the rack's musicians to that macro", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [target({ mode: "rack" })]);
    await watchSession(h.generation, h.ctx);

    rack.params[3].emit("value", 5);
    expect(h.touches).toEqual([{ musicians: ["ALEX"], track: "bass 1", macro: 3 }]);
  });
});

describe("automation", () => {
  test("a macro moved by its playing automation updates the panel but does not take the focus", async () => {
    const { world, rack } = chainWorld();
    rack.params[2].props.automation_state = "playing";
    const h = harness(world, [target({ mode: "rack" })]);
    await watchSession(h.generation, h.ctx);

    rack.params[2].emit("value", 90);
    await wait(OVERRIDE_SETTLE_MS + 30);
    expect(h.panel()?.macros[1].value).toBe(90);
    expect(h.touches).toEqual([]);
  });

  test("a knob that overrides the automation takes the focus, even when Live reports the override after the value", async () => {
    const { world, rack } = chainWorld(1);
    rack.params[1].props.automation_state = "playing";
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    rack.params[1].emit("value", 40);
    rack.params[1].emit("automation_state", "overridden");
    await eventually(() => expect(h.touches).toEqual([{ musicians: ["ALEX"], track: "bass 1", macro: 1 }]));
    rack.params[1].emit("value", 41);
    expect(h.touches).toHaveLength(2);
  });
});

describe("overridden automation", () => {
  test("flags the panel macro whose automation a knob overrode, also in chain mode, until it plays again", async () => {
    const { world, rack } = chainWorld(1);
    rack.params[3].props.automation_state = "overridden";
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    await eventually(() => expect(h.panel()?.macros.map((m) => m.overridden ?? false)).toEqual([false, false, true, false, false, false, false, false]));
    rack.params[3].emit("automation_state", "playing");
    expect(h.panel()?.macros[2].overridden).toBeUndefined();
  });
});

describe("chain mode", () => {
  test("shows the macros of the first rack in the chain macro 16 selects, and swaps with it", async () => {
    const { world, rack, acid, lead } = chainWorld(1);
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    expect(h.panel()?.chain).toEqual({ number: 1, name: "1 ACID" });
    expect(names(h.panel())?.[0]).toBe("ACID m1");

    rack.params[16].emit("value", 2);
    await eventually(() => expect(names(h.panel())?.[0]).toBe("LEAD m1"));
    expect(h.panel()?.chain).toEqual({ number: 2, name: "2 LEAD" });
    expect(acid.params[1].listenerCount("value")).toBe(0);
    lead.params[1].emit("value", 99);
    expect(h.panel()?.macros[0].value).toBe(99);
  });

  test("macro 16 at 0 or past the last chain selects nothing", async () => {
    const { world, rack } = chainWorld(0);
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    expect(h.panel()).toMatchObject({ chain: null, macros: [] });
    rack.params[16].emit("value", 1);
    await eventually(() => expect(h.panel()?.chain?.number).toBe(1));
    rack.params[16].emit("value", 7);
    await eventually(() => expect(h.panel()).toMatchObject({ chain: null, macros: [] }));
  });

  test("an outer knob gives the focus; the inner rack's macro values do not count as touches", async () => {
    const { world, rack, acid } = chainWorld(1);
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    acid.params[1].emit("value", 30);
    expect(h.touches).toEqual([]);
    rack.params[1].emit("value", 30);
    expect(h.touches).toEqual([{ musicians: ["ALEX"], track: "bass 1", macro: 1 }]);
  });

  test("a chain change moves the focus once the launch grace has passed", async () => {
    const { world, rack } = chainWorld(1);
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    rack.params[16].emit("value", 2);
    expect(h.touches).toEqual([]);
    await eventually(() => expect(h.touches).toEqual([{ musicians: ["ALEX"], track: "bass 1", macro: null }]));
  });

  test.each([
    ["fired before", "fired_slot_index", true],
    ["started after", "playing_slot_index", false],
  ])("a chain change next to a clip %s is an X-Clip recall: the focus stays", async (_, prop, isBefore) => {
    const { world, rack } = chainWorld(1);
    const h = harness(world, [target({ mode: "chain" })]);
    await watchSession(h.generation, h.ctx);

    if (isBefore) world.track.emit(prop, 0);
    rack.params[16].emit("value", 2);
    if (!isBefore) world.track.emit(prop, 0);
    await wait(LAUNCH_GRACE_MS + 50);
    expect(h.touches).toEqual([]);
    expect(h.panel()?.chain?.number).toBe(2);
  });
});

describe("chain label", () => {
  test("puts the active chain on the track and follows macro 16, without any panel", async () => {
    const { world, rack } = chainWorld(2);
    const h = harness(world, [target({ label: true })]);
    await watchSession(h.generation, h.ctx);

    expect(h.model().tracks[0].chain).toEqual({ number: 2, name: "2 LEAD" });
    expect(h.panel()).toBeUndefined();
    rack.params[16].emit("value", 0);
    await eventually(() => expect(h.model().tracks[0].chain).toBeNull());
  });

  test("follows the macro chosen in the settings instead of macro 16", async () => {
    const { world, rack } = chainWorld(1);
    const h = harness(world, [target({ label: true })], 12);
    await watchSession(h.generation, h.ctx);

    expect(h.model().tracks[0].chain).toBeNull();
    rack.params[12].emit("value", 2);
    await eventually(() => expect(h.model().tracks[0].chain).toEqual({ number: 2, name: "2 LEAD" }));
    expect(rack.params[16].listenerCount("value")).toBe(0);
  });

  test("lists the track's racks by name", async () => {
    const { world } = chainWorld();
    const h = harness(world, []);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].racks).toEqual(["BASS"]);
  });
});

describe("lifecycle", () => {
  test("a rack the target names but the track lacks is skipped", async () => {
    const { world } = chainWorld();
    const h = harness(world, [target({ rack: "NOPE", mode: "rack" })]);
    await watchSession(h.generation, h.ctx);
    expect(h.panel()).toBeUndefined();
  });

  test("detaches every listener, inner rack included, when the generation is torn down", async () => {
    const { world, rack, acid } = chainWorld(1);
    const h = harness(world, [target({ mode: "chain", label: true })]);
    await watchSession(h.generation, h.ctx);

    await Promise.all(h.generation.allRemovers().map((remove) => remove()));
    expect(rack.params.every((p) => p.listenerCount("value") === 0)).toBe(true);
    expect(acid.params.every((p) => p.listenerCount("value") === 0 && p.listenerCount("name") === 0)).toBe(true);
  });

  test("a superseded generation no longer publishes", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [target({ mode: "rack" })]);
    await watchSession(h.generation, h.ctx);

    h.supersede();
    rack.params[1].emit("value", 77);
    expect(h.panel()?.macros[0].value).toBe(10);
    expect(h.touches).toEqual([]);
  });
});

describe("macro flags", () => {
  const flagged = (macro: number, track = "bass 1") => target({ flags: [{ track, macro }] });

  test("lights the track while the macro sits at 127", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [flagged(2)]);
    await watchSession(h.generation, h.ctx);

    expect(h.model().tracks[0].fx).toBe(false);
    rack.params[2].emit("value", 127);
    expect(h.model().tracks[0].fx).toBe(true);
    rack.params[2].emit("value", 126.4);
    expect(h.model().tracks[0].fx).toBe(false);
  });

  test("reads the macro at load: a switch already on lights the track", async () => {
    const { world, rack } = chainWorld();
    rack.params[2].props.value = 127;
    const h = harness(world, [flagged(2)]);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].fx).toBe(true);
  });

  test("follows each macro of the rack for its own track", async () => {
    const { world, rack } = chainWorld();
    const h = harness(world, [target({ flags: [{ track: "bass 1", macro: 1 }, { track: "ghost", macro: 2 }] })]);
    await watchSession(h.generation, h.ctx);

    rack.params[2].emit("value", 127);
    expect(h.model().tracks[0].fx).toBe(false);
    rack.params[1].emit("value", 127);
    expect(h.model().tracks[0].fx).toBe(true);
  });

  test("leaves the track alone when it is missing from the set or the macro does not exist", async () => {
    const { world } = chainWorld();
    const h = harness(world, [target({ flags: [{ track: "ghost", macro: 1 }, { track: "bass 1", macro: 99 }] })]);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].fx).toBeUndefined();
  });

  test("a flag-only target publishes no control panel", async () => {
    const { world } = chainWorld();
    const h = harness(world, [flagged(1)]);
    await watchSession(h.generation, h.ctx);
    expect(h.panel()).toBeUndefined();
  });
});
