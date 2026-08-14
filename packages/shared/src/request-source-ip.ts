import { isIP } from "node:net";

const CLOUDFLARE_IPV4_RANGES = [
  ["173.245.48.0", 20], ["103.21.244.0", 22], ["103.22.200.0", 22],
  ["103.31.4.0", 22], ["141.101.64.0", 18], ["108.162.192.0", 18],
  ["190.93.240.0", 20], ["188.114.96.0", 20], ["197.234.240.0", 22],
  ["198.41.128.0", 17], ["162.158.0.0", 15], ["104.16.0.0", 13],
  ["172.64.0.0", 13], ["131.0.72.0", 22]
] as const;

const CLOUDFLARE_IPV6_RANGES = [
  ["2400:cb00::", 32], ["2606:4700::", 32], ["2803:f800::", 32],
  ["2405:b500::", 32], ["2405:8100::", 32], ["2a06:98c0::", 29],
  ["2c0f:f248::", 32]
] as const;

/** Published hosted-Claude connector egress range, verified 2026-08-14. */
export const ANTHROPIC_MCP_EGRESS_CIDRS = [["160.79.104.0", 21]] as const;

export type AnonymousRequesterNetwork = "anthropic" | "direct" | "unknown";

function unquote(value: string) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

export function normalizeRequestSourceIp(value: string | null | undefined) {
  const candidate = unquote(value?.trim() ?? "");
  if (!candidate) return null;
  if (isIP(candidate)) return candidate;

  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate)?.[1] ?? null;
  if (bracketedIpv6 && isIP(bracketedIpv6) === 6) return bracketedIpv6;

  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(candidate)?.[1] ?? null;
  return ipv4WithPort && isIP(ipv4WithPort) === 4 ? ipv4WithPort : null;
}

function ipv4ToInteger(value: string) {
  return value.split(".").reduce((result, part) => result * 256 + Number(part), 0) >>> 0;
}

function ipv6ToInteger(value: string) {
  const [left, right] = value.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missingGroups = 8 - leftGroups.length - rightGroups.length;
  const groups = [...leftGroups, ...Array.from({ length: missingGroups }, () => "0"), ...rightGroups];
  return groups.reduce((result, group) => (result << 16n) | BigInt(Number.parseInt(group || "0", 16)), 0n);
}

function isIpInCidr(ip: string, network: string, prefix: number) {
  const version = isIP(ip);
  if (version !== isIP(network)) return false;

  const bits = version === 4 ? 32 : 128;
  const value = version === 4 ? BigInt(ipv4ToInteger(ip)) : ipv6ToInteger(ip);
  const networkValue = version === 4 ? BigInt(ipv4ToInteger(network)) : ipv6ToInteger(network);
  const shift = BigInt(bits - prefix);
  return (value >> shift) === (networkValue >> shift);
}

function isCloudflareIp(ip: string) {
  const ranges = isIP(ip) === 4 ? CLOUDFLARE_IPV4_RANGES : CLOUDFLARE_IPV6_RANGES;
  return ranges.some(([network, prefix]) => isIpInCidr(ip, network, prefix));
}

export function anonymousRequesterNetwork(ip: string | null | undefined): AnonymousRequesterNetwork {
  const normalized = normalizeRequestSourceIp(ip);
  if (!normalized) return "unknown";
  return ANTHROPIC_MCP_EGRESS_CIDRS.some(([network, prefix]) => isIpInCidr(normalized, network, prefix))
    ? "anthropic"
    : "direct";
}

/**
 * Production traffic reaches the service through an AWS ALB in append mode.
 * The ALB-observed peer is the rightmost valid XFF entry. Values to its left,
 * standalone CF-Connecting-IP, and X-Real-IP are caller-controlled.
 */
export function getTrustedRequestSourceIp(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for")?.split(",") ?? [];
  const rightmostForwarded = normalizeRequestSourceIp(forwarded.at(-1));
  const cloudflareClientIp = normalizeRequestSourceIp(headers.get("cf-connecting-ip"));
  if (rightmostForwarded && cloudflareClientIp && isCloudflareIp(rightmostForwarded)) {
    return cloudflareClientIp;
  }
  return rightmostForwarded ?? null;
}
