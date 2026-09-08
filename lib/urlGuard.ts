/**
 * SSRF guard for server-side URL fetches (ingest journey). Every fetch target
 * — including each redirect hop — must pass `validateRemoteUrl`: https only,
 * hostname not a blocked literal, and every resolved address inside public
 * unicast space. Unparseable addresses fail closed.
 *
 * IP math stays inside unsigned-32-bit operations (no BigInt) — IPv6 is
 * handled as eight 16-bit groups.
 */

export type LookupAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

type Ipv4Octets = [number, number, number, number];
type Ipv6Groups = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function parseIpv4(ip: string): Ipv4Octets | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets as Ipv4Octets;
}

function parseIpv6Groups(input: string): Ipv6Groups | null {
  let ip = input.toLowerCase();
  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4Tail) {
    const octets = parseIpv4(v4Tail[1]);
    if (octets === null) return null;
    const high = (octets[0]! << 8) | octets[1]!;
    const low = (octets[2]! << 8) | octets[3]!;
    ip = `${ip.slice(0, ip.length - v4Tail[1].length)}${high.toString(16)}:${low.toString(16)}`;
  }
  if (!ip.includes(":")) return null;

  const sections = ip.split(":");
  if (sections[0] === "") sections.shift();
  if (sections[sections.length - 1] === "") sections.pop();
  const emptyIndex = sections.indexOf("");
  let head: string[];
  let tail: string[];
  if (emptyIndex >= 0) {
    if (sections.indexOf("", emptyIndex + 1) >= 0) return null;
    head = sections.slice(0, emptyIndex);
    tail = sections.slice(emptyIndex + 1);
  } else {
    head = sections;
    tail = [];
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (emptyIndex >= 0 && missing < 1) || (emptyIndex < 0 && missing !== 0)) {
    return null;
  }
  const raw = [...head, ...Array(missing).fill("0"), ...tail];
  const groups: number[] = [];
  for (const group of raw) {
    if (!/^[0-9a-f]{1,4}$/.test(group!)) return null;
    groups.push(parseInt(group!, 16));
  }
  return groups as Ipv6Groups;
}

function v4ToNumber(octets: Ipv4Octets): number {
  return (
    ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>>
    0
  );
}

function v4InCidr(value: number, cidr: string): boolean {
  const [baseText, prefixText] = cidr.split("/");
  const base = parseIpv4(baseText!);
  const prefix = Number(prefixText);
  if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (v4ToNumber(base) & mask);
}

function v6InCidr(value: Ipv6Groups, cidr: string): boolean {
  const [baseText, prefixText] = cidr.split("/");
  const base = parseIpv6Groups(baseText!);
  const prefix = Number(prefixText);
  if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    return false;
  }
  const fullGroups = Math.floor(prefix / 16);
  for (let index = 0; index < fullGroups; index += 1) {
    if (value[index] !== base[index]) return false;
  }
  const remainder = prefix % 16;
  if (remainder > 0) {
    const mask = (0xffff << (16 - remainder)) & 0xffff;
    if ((value[fullGroups]! & mask) !== (base[fullGroups]! & mask)) return false;
  }
  return true;
}

const BLOCKED_V4_RANGES = [
  "0.0.0.0/8", // this network
  "10.0.0.0/8", // private
  "100.64.0.0/10", // CGNAT (Tailscale, carrier NAT)
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local incl. cloud metadata
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved + broadcast
];

const BLOCKED_V6_RANGES = [
  "::/128", // unspecified
  "::1/128", // loopback
  "::/96", // IPv4-compatible (deprecated)
  "::ffff:0:0/96", // IPv4-mapped — blocked family, embedded v4 noted
  "64:ff9b::/96", // NAT64
  "100::/64", // discard-only
  "2001::/32", // Teredo
  "2001:db8::/32", // documentation
  "2002::/16", // 6to4
  "fc00::/7", // unique local
  "fe80::/10", // link-local
  "ff00::/8", // multicast
];

function isBlockedIpv4(value: number): boolean {
  return BLOCKED_V4_RANGES.some((cidr) => v4InCidr(value, cidr));
}

function groupsToV4Number(groups: Ipv6Groups, highIndex: 6 | 1): number {
  if (highIndex === 6) {
    return ((groups[6]! << 16) | groups[7]!) >>> 0;
  }
  return ((groups[1]! << 16) | groups[2]!) >>> 0;
}

/** IPv4 carried inside mapped/NAT64 (/96 tail) or 6to4 (groups 1-2) forms. */
function embeddedIpv4(value: Ipv6Groups): number | null {
  const prefix16 = (value[0]! << 16) | value[1]!;
  if (prefix16 === 0x0000ffff || prefix16 === 0x0064ff9b) {
    return groupsToV4Number(value, 6);
  }
  if (value[0] === 0x2002) {
    return groupsToV4Number(value, 1);
  }
  return null;
}

export function isBlockedIp(ip: string): boolean {
  if (ip.includes(":")) {
    const groups = parseIpv6Groups(ip);
    if (groups === null) return true; // unparseable — fail closed
    if (embeddedIpv4(groups) !== null) {
      // Mapped/NAT64/6to4 forms only reach v4 through translation we do not
      // allow; blocked outright, and doubly so when the embedded v4 is private.
      return true;
    }
    return BLOCKED_V6_RANGES.some((cidr) => v6InCidr(groups, cidr));
  }
  const octets = parseIpv4(ip);
  if (octets === null) return true; // unparseable — fail closed
  return isBlockedIpv4(v4ToNumber(octets));
}

/** Normalizes URL.hostname: lowercases, strips IPv6 brackets and the root dot. */
export function normalizeHostname(hostname: string): string {
  let host = hostname.toLowerCase().trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  return host;
}

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (host === "localhost" || host === "localhost.") return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  // Only run the fail-closed IP check on actual IP literals — a name that
  // fails IP parsing is a hostname and must be resolved instead.
  if (host.includes(":") || IPV4_LITERAL.test(host)) {
    return isBlockedIp(host);
  }
  return false;
}

export type RemoteUrlCheck = {
  url: string;
  protocol: "https:";
  hostname: string;
  addresses: LookupAddress[];
};

/**
 * Validates one fetch target: https, non-blocked host, and every DNS answer in
 * public unicast space. Call again for each redirect hop before fetching.
 */
export async function validateRemoteUrl(
  url: string,
  lookup: LookupFn
): Promise<RemoteUrlCheck> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedUrlError("Invalid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new BlockedUrlError("Only https URLs are supported.");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    throw new BlockedUrlError("That host is not reachable for ingest.");
  }
  const addresses = await lookup(hostname);
  if (addresses.length === 0) {
    throw new BlockedUrlError("That host could not be resolved.");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new BlockedUrlError("That host is not reachable for ingest.");
    }
  }
  return { url: parsed.toString(), protocol: "https:", hostname, addresses };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function resolveRedirectLocation(
  location: string,
  baseUrl: string
): string | null {
  try {
    const next = new URL(location, baseUrl);
    if (next.protocol !== "https:") return null;
    return next.toString();
  } catch {
    return null;
  }
}
