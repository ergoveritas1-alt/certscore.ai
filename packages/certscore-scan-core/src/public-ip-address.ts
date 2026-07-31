import { isIP } from "node:net";

function parseIpv4(value: string): number | null {
  if (isIP(value) !== 4) return null;
  const octets = value.split(".").map(Number);
  if (octets.length !== 4) return null;
  return octets.reduce((result, octet) => (result * 256) + octet, 0) >>> 0;
}

function ipv4InCidr(value: number, base: number, prefixLength: number) {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (base & mask);
}

const NON_PUBLIC_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function isPublicIpv4(value: string) {
  const parsed = parseIpv4(value);
  if (parsed === null) return false;
  if (value === "192.0.0.9" || value === "192.0.0.10") return true;
  return !NON_PUBLIC_IPV4_RANGES.some(([base, prefixLength]) => {
    const parsedBase = parseIpv4(base);
    return parsedBase !== null && ipv4InCidr(parsed, parsedBase, prefixLength);
  });
}

function parseIpv6Hextets(value: string): number[] | null {
  if (isIP(value) !== 6) return null;
  let normalized = value.toLowerCase();
  const embeddedIpv4 = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (embeddedIpv4) {
    const parsedIpv4 = parseIpv4(embeddedIpv4);
    if (parsedIpv4 === null) return null;
    normalized = normalized.slice(0, -embeddedIpv4.length) +
      `${((parsedIpv4 >>> 16) & 0xffff).toString(16)}:${(parsedIpv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const values = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part, 16));
  return values.length === 8 && values.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? values
    : null;
}

function mappedIpv4(hextets: number[]) {
  if (
    hextets.slice(0, 5).every((part) => part === 0) &&
    hextets[5] === 0xffff
  ) {
    const high = hextets[6] ?? 0;
    const low = hextets[7] ?? 0;
    return [
      high >>> 8,
      high & 0xff,
      low >>> 8,
      low & 0xff,
    ].join(".");
  }
  return null;
}

function isPublicIpv6(value: string) {
  const hextets = parseIpv6Hextets(value);
  if (!hextets) return false;
  const mapped = mappedIpv4(hextets);
  if (mapped) return isPublicIpv4(mapped);

  const [first = 0, second = 0, third = 0] = hextets;
  const globallyAllocatedUnicast = first >= 0x2000 && first <= 0x3fff;
  if (!globallyAllocatedUnicast) return false;

  if (first === 0x2001 && second === 0x0002 && third === 0) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2001 && ((second & 0xfff0) === 0x0010 || (second & 0xfff0) === 0x0020)) return false;
  if (first === 0x2002) return false;
  if (first === 0x3fff && (second & 0xf000) === 0) return false;
  return true;
}

/**
 * Returns a bounded canonical IP only when the address is publicly routable.
 * Non-public addresses are deliberately omitted from retained projectable
 * network evidence.
 */
export function normalizePublicIpAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("%")) return null;
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;
  const family = isIP(unwrapped);
  if (family === 4) return isPublicIpv4(unwrapped) ? unwrapped : null;
  if (family !== 6 || !isPublicIpv6(unwrapped)) return null;

  const hextets = parseIpv6Hextets(unwrapped);
  const mapped = hextets ? mappedIpv4(hextets) : null;
  return mapped ?? unwrapped.toLowerCase();
}
