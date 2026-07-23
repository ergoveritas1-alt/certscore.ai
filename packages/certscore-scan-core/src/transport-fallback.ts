import { isIP } from "node:net";
import { getRegistrableDomain } from "./domain-utils.js";

const NAVIGATION_TRANSPORT_ERROR_PATTERNS = [
  /timeout/i,
  /ERR_(?:CONNECTION|SSL|TLS|CERT|HTTP2|PROTOCOL|NETWORK|SOCKET|TUNNEL|INVALID_AUTH|HTTP_RESPONSE_CODE)/i,
  /ECONN(?:RESET|REFUSED|ABORTED)/i,
  /EHOSTUNREACH/i,
  /ENETUNREACH/i,
  /socket hang up/i,
  /client network socket disconnected/i,
  /failed to establish a new connection/i,
];

const TRANSIENT_MAIN_DOCUMENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const PENDING_MAIN_DOCUMENT_STATUSES = new Set([202]);

export function httpTransportFallbackUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.protocol = "http:";
    return url.toString();
  } catch {
    return null;
  }
}

export function isNavigationTransportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return NAVIGATION_TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function alternateWwwNavigationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (isIP(hostname) || hostname === "localhost" || !hostname.includes(".")) return null;
    const registrableDomain = getRegistrableDomain(hostname);
    if (!registrableDomain) return null;
    if (hostname === registrableDomain) {
      url.hostname = `www.${registrableDomain}`;
      return url.toString();
    }
    if (hostname === `www.${registrableDomain}`) {
      url.hostname = registrableDomain;
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function navigationTransportRecoveryUrls(value: string): string[] {
  const alternateHost = alternateWwwNavigationUrl(value);
  const candidates = [
    alternateHost,
    httpTransportFallbackUrl(value),
  ];
  if (alternateHost) candidates.push(httpTransportFallbackUrl(alternateHost));
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate) && candidate !== value))];
}

export function isTransientMainDocumentStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && TRANSIENT_MAIN_DOCUMENT_STATUSES.has(status);
}

/**
 * A 202 document can be a short-lived browser/pending shell rather than the
 * public page. It is only eligible for recovery when the caller also proves
 * that the retained document is sparse; a normal 202 response must not be
 * treated as a failure or retried unconditionally.
 */
export function isPendingMainDocumentStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && PENDING_MAIN_DOCUMENT_STATUSES.has(status);
}

export function boundedRetryAfterMs(value: string | null | undefined, maxMs = 2_000): number {
  if (!value) return 500;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maxMs, Math.round(seconds * 1_000));
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return 500;
  return Math.max(0, Math.min(maxMs, dateMs - Date.now()));
}
