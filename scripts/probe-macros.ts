import { Ableton } from "ableton-js";
import type { AnyDevice } from "ableton-js/ns/device";
import { isRackDevice, type RackDevice } from "ableton-js/ns/rack-device";
import { chainDevices } from "../server/live-racks.ts";

const TRACK_NAME = process.argv[2];
if (!TRACK_NAME) {
  console.error('Usage: npm run probe:macros "<track name>"');
  process.exit(1);
}
const PLAYED_MACROS = 8;
const CHAIN_MACRO = 16;

const ableton = new Ableton();
const t0 = Date.now();
const log = (...args: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...args);

async function dump(devices: AnyDevice[], depth: number): Promise<void> {
  const pad = "  ".repeat(depth);
  for (const device of devices) {
    console.log(`${pad}- ${device.raw.name} (${device.raw.class_name})`);
    if (!isRackDevice(device)) continue;
    const params = await device.get("parameters");
    const macros = params.slice(1, PLAYED_MACROS + 1).map((p) => `${p.raw.name}=${p.raw.value.toFixed(1)}`);
    console.log(`${pad}  macros: ${macros.join(" | ")}  | m16=${params[CHAIN_MACRO]?.raw.value}`);
    const chains = await device.get("chains");
    for (const [ci, chain] of chains.entries()) {
      console.log(`${pad}  chain ${ci} "${chain.raw.name}"`);
      await dump(await chainDevices(chain), depth + 2);
    }
  }
}

async function playedRack(devices: AnyDevice[]): Promise<RackDevice | null> {
  for (const device of devices) {
    if (!isRackDevice(device)) continue;
    const chains = await device.get("chains");
    if (chains.length >= 2 && device.raw.name.startsWith(TRACK_NAME)) return device;
    if (chains.length === 1) return playedRack(await chainDevices(chains[0]));
  }
  return null;
}

async function innerMacro(rack: RackDevice, chainIndex: number, macro: number): Promise<string> {
  const chain = (await rack.get("chains"))[chainIndex];
  if (!chain) return `no chain ${chainIndex}`;
  const inner = (await chainDevices(chain)).filter(isRackDevice);
  if (inner.length === 0) return `chain "${chain.raw.name}": no inner rack`;
  const labels = await Promise.all(
    inner.map(async (r) => {
      const p = (await r.get("parameters"))[macro];
      return `${r.raw.name}.${p?.raw.name}=${p?.raw.value.toFixed(1)}`;
    }),
  );
  return `chain ${chainIndex} "${chain.raw.name}" -> ${labels.join(", ")}`;
}

async function main() {
  await ableton.start();
  const track = (await ableton.song.get("tracks")).find((t) => t.raw.name === TRACK_NAME);
  if (!track) throw new Error(`track "${TRACK_NAME}" not found`);
  const devices = await track.get("devices");
  console.log(`=== ${TRACK_NAME}`);
  await dump(devices, 0);

  const rack = await playedRack(devices);
  if (!rack) throw new Error("no multi-chain rack");
  const params = await rack.get("parameters");
  log(`played rack: ${rack.raw.name}, chains=${(await rack.get("chains")).length}`);

  await params[CHAIN_MACRO].addListener("value", (v) => log(`m16 -> ${v}`));
  for (let m = 1; m <= PLAYED_MACROS; m++) {
    await params[m].addListener("value", async (v) => {
      const chainValue = await params[CHAIN_MACRO].get("value");
      const t = Date.now();
      const label = await innerMacro(rack, Math.round(chainValue) - 1, m);
      log(`macro ${m} (${params[m].raw.name}) = ${Number(v).toFixed(1)} | m16=${chainValue} | ${label} [${Date.now() - t}ms]`);
    });
  }
  log("listening — turn knobs on ALEX 1, Ctrl+C to quit");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
