export const PUBLIC_TARGET_POLICY_VERSION = "certscore.public-target.v1" as const;

export type PublicTargetAddressClassification = {
  address: string;
  family: 4 | 6 | null;
  public: boolean;
  reason:
    | "globally_reachable"
    | "invalid_address"
    | "ipv4_mapped_ipv6"
    | "non_global_ipv4"
    | "non_global_ipv6";
};

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
] as const;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
]);

const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.31.196.0/24",
  "192.52.193.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "192.175.48.0/24",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
] as const;

const BLOCKED_IPV6_CIDRS = [
  "2001:0::/23",
  "2001:db8::/32",
  "2002::/16",
  "3fff::/20",
] as const;

const PUBLIC_IPV6_UNICAST_CIDR = "2000::/3" as const;

export function normalizeTargetHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isLocalOnlyTargetHostname(hostname: string) {
  const normalized = normalizeTargetHostname(hostname);
  return BLOCKED_HOSTNAMES.has(normalized) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function classifyPublicTargetAddress(address: string): PublicTargetAddressClassification {
  const normalized = address.trim().replace(/^\[|\]$/g, "");
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) {
    return {
      address: normalized,
      family: 4,
      public: !BLOCKED_IPV4_CIDRS.some((cidr) => ipv4InCidr(ipv4, cidr)),
      reason: BLOCKED_IPV4_CIDRS.some((cidr) => ipv4InCidr(ipv4, cidr))
        ? "non_global_ipv4"
        : "globally_reachable",
    };
  }

  const ipv6 = parseIpv6(normalized);
  if (ipv6 === null) {
    return { address: normalized, family: null, public: false, reason: "invalid_address" };
  }
  const mapped = ipv4MappedFromIpv6(ipv6);
  if (mapped !== null) {
    const mappedPublic = !BLOCKED_IPV4_CIDRS.some((cidr) => ipv4InCidr(mapped, cidr));
    return {
      address: normalized,
      family: 6,
      public: mappedPublic,
      reason: mappedPublic ? "globally_reachable" : "ipv4_mapped_ipv6",
    };
  }
  const publicAddress = ipv6InCidr(ipv6, PUBLIC_IPV6_UNICAST_CIDR) &&
    !BLOCKED_IPV6_CIDRS.some((cidr) => ipv6InCidr(ipv6, cidr));
  return {
    address: normalized,
    family: 6,
    public: publicAddress,
    reason: publicAddress ? "globally_reachable" : "non_global_ipv6",
  };
}

export function isPublicTargetAddress(address: string) {
  return classifyPublicTargetAddress(address).public;
}

export function assertPublicTargetHostname(hostname: string) {
  const normalized = normalizeTargetHostname(hostname);
  if (!normalized || isLocalOnlyTargetHostname(normalized)) {
    throw new Error("Non-public target");
  }
  const literal = classifyPublicTargetAddress(normalized);
  if (literal.family !== null && !literal.public) {
    throw new Error("Non-public target");
  }
  return normalized;
}

function parseIpv4(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const octets = value.split(".").map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
}

function ipv4InCidr(address: number, cidr: string) {
  const [networkValue, prefixValue] = cidr.split("/");
  const network = parseIpv4(networkValue!);
  const prefix = Number(prefixValue);
  if (network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (network & mask) >>> 0;
}

function parseIpv6(value: string): bigint | null {
  if (!value || value.includes("%") || (value.match(/::/g)?.length ?? 0) > 1) return null;
  let candidate = value.toLowerCase();
  const ipv4Tail = candidate.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const parsedIpv4 = parseIpv4(ipv4Tail);
    if (parsedIpv4 === null) return null;
    const high = ((parsedIpv4 >>> 16) & 0xffff).toString(16);
    const low = (parsedIpv4 & 0xffff).toString(16);
    candidate = `${candidate.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }
  const halves = candidate.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return groups.reduce((total, group) => (total << 16n) | BigInt(Number.parseInt(group, 16)), 0n);
}

function parseIpv6Cidr(cidr: string): { network: bigint; prefix: number } | null {
  const [networkValue, prefixValue] = cidr.split("/");
  const network = parseIpv6(networkValue!);
  const prefix = Number(prefixValue);
  return network !== null && Number.isInteger(prefix) && prefix >= 0 && prefix <= 128
    ? { network, prefix }
    : null;
}

function ipv6InCidr(address: bigint, cidr: string) {
  const parsed = parseIpv6Cidr(cidr);
  if (!parsed) return false;
  if (parsed.prefix === 0) return true;
  const shift = BigInt(128 - parsed.prefix);
  return address >> shift === parsed.network >> shift;
}

function ipv4MappedFromIpv6(address: bigint): number | null {
  return address >> 32n === 0xffffn ? Number(address & 0xffffffffn) : null;
}
