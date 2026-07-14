const NAVIGATION_TRANSPORT_ERROR_PATTERNS = [
  /timeout/i,
  /ERR_(?:CONNECTION|SSL|TLS|CERT|HTTP2|PROTOCOL|NETWORK|SOCKET)/i,
  /ECONN(?:RESET|REFUSED|ABORTED)/i,
  /EHOSTUNREACH/i,
  /ENETUNREACH/i,
  /socket hang up/i,
  /client network socket disconnected/i,
  /failed to establish a new connection/i,
];

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
