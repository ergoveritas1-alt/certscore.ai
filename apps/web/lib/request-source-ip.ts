import { isIP } from "node:net";

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

/**
 * Production web traffic reaches the app through an AWS ALB using its default
 * append behavior. The ALB-observed peer is therefore the rightmost valid XFF
 * entry; caller-supplied entries to its left must not override it.
 */
export function getTrustedRequestSourceIp(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for")
    ?.split(",")
    .map((entry) => normalizeRequestSourceIp(entry))
    .filter((entry): entry is string => Boolean(entry)) ?? [];

  return forwarded.at(-1) ??
    normalizeRequestSourceIp(headers.get("cf-connecting-ip")) ??
    normalizeRequestSourceIp(headers.get("x-real-ip"));
}
