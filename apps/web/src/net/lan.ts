/** The shape of `os.networkInterfaces()`, kept local so this file stays free of Node imports. */
export type NetworkInterfaces = Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>;

// Adapters of virtual machines and WSL have private addresses no phone on the Wi-Fi can reach.
const VIRTUAL_ADAPTER = /vethernet|wsl|virtualbox|vmware|hyper-v|docker|vbox|utun|tailscale|zerotier/i;
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** The IPv4 address a phone on the same Wi-Fi can reach this machine at, or null if there is none. */
export function pickLanAddress(interfaces: NetworkInterfaces): string | null {
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL_ADAPTER.test(name))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter((entry) => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal && PRIVATE_IPV4.test(entry.address))
    .map((entry) => entry.address);
  // Home routers almost always hand out 192.168.x.x; prefer it over corporate or VPN ranges.
  return candidates.find((address) => address.startsWith('192.168.')) ?? candidates[0] ?? null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The origin to put in the join QR. The address the page was opened with wins, so a phone reaches the
 * same server; only a loopback address, useless to a phone, is swapped for the LAN one (`pnpm dev:lan`).
 */
export function shareableOrigin(location: Pick<Location, 'protocol' | 'hostname' | 'port' | 'origin'>, lanHost?: string): string {
  if (lanHost === undefined || lanHost === '' || !LOOPBACK.has(location.hostname)) return location.origin;
  return `${location.protocol}//${lanHost}${location.port === '' ? '' : `:${location.port}`}`;
}
