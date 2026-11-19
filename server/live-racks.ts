import type { Chain } from "ableton-js/ns/chain";
import type { AnyDevice } from "ableton-js/ns/device";
import type { DeviceParameter } from "ableton-js/ns/device-parameter";
import type { AnyChain } from "ableton-js/ns/drum-chain";
import { type RackDevice, isRackClassName } from "ableton-js/ns/rack-device";
import type { ActiveChain } from "./protocol.ts";

/** parameters[0] is Device On, then Macros 1-16. */
export const PLAYED_MACROS = 8;

// By class name rather than ableton-js's instanceof check: same answer on Live's objects, and testable with fakes.
export const isRack = (device: AnyDevice): device is RackDevice => isRackClassName(device.raw.class_name);

// ableton-js types chains as a union whose get() TypeScript cannot call; both kinds hold devices the same way.
export const chainDevices = (chain: AnyChain): Promise<AnyDevice[]> => (chain as Chain).get("devices");

/** Top-level racks, and those inside one-chain wrappers, the way ClyphX's DEV() finds them. */
export async function findRacks(devices: readonly AnyDevice[]): Promise<RackDevice[]> {
  const perRack = await Promise.all(
    devices.filter(isRack).map(async (rack) => {
      const chains = await rack.get("chains");
      return chains.length === 1 ? [rack, ...(await findRacks(await chainDevices(chains[0])))] : [rack];
    }),
  );
  return perRack.flat();
}

/** The chain macro (16 by default) set to n selects chain n, the nth of the list; 0 selects none. */
export function activeChain(value: number, chains: readonly { raw: { name: string } }[]): ActiveChain | null {
  const number = Math.round(value);
  const chain = chains[number - 1];
  return chain ? { number, name: chain.raw.name } : null;
}

export const playedMacros = (parameters: readonly DeviceParameter[]): DeviceParameter[] =>
  parameters.slice(1, PLAYED_MACROS + 1);

/** The first rack of the chain: its macros are the ones the outer macros drive. */
export async function innerRack(chain: AnyChain | undefined): Promise<RackDevice | null> {
  if (!chain) return null;
  return (await chainDevices(chain)).find(isRack) ?? null;
}
