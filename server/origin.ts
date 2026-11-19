import { isIP } from "node:net";

export interface UpgradeHeaders {
  host: string | undefined;
  origin: string | undefined;
}

function hostname(hostHeader: string): string {
  if (hostHeader.startsWith("[")) return hostHeader.slice(1, hostHeader.indexOf("]"));
  const colon = hostHeader.lastIndexOf(":");
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon);
}

// Names a home router hands out from DHCP (Mac.lan…): no public DNS delegates these suffixes.
const ROUTER_DNS_SUFFIXES = [".lan", ".home", ".home.arpa", ".internal"];
const LOCAL_SUFFIXES = [".local", ...ROUTER_DNS_SUFFIXES];

/**
 * Only names that resolve on the local network are accepted, so DNS rebinding (an attacker's domain
 * pointed at this Mac) cannot pass as a same-origin page.
 */
export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const name = hostname(hostHeader.toLowerCase());
  return isIP(name) !== 0 || name === "localhost" || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Browsers send an Origin on every WebSocket handshake and let any page open one, so the page must be
 * served by this very server. Clients without an Origin (scripts, curl) are not browsers and pass.
 */
export function isAllowedUpgrade({ host, origin }: UpgradeHeaders): boolean {
  if (!isAllowedHost(host)) return false;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host.toLowerCase() === host?.toLowerCase();
  } catch {
    return false;
  }
}
