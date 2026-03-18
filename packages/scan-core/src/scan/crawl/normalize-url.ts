export function normalizeScanUrl(input: string): string {
  const trimmedInput = input.trim();

  if (trimmedInput.length === 0) {
    throw new Error("URL is required for crawl normalization.");
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedInput) ? trimmedInput : `https://${trimmedInput}`;
  const url = new URL(candidate);

  if (!url.hostname || !url.hostname.includes(".")) {
    throw new Error(`Invalid crawl URL: ${input}`);
  }

  url.protocol = url.protocol === "http:" || url.protocol === "https:" ? url.protocol : "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.search = "";

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  } else {
    url.pathname = "/";
  }

  return url.toString();
}

export function normalizeDiscoveredUrl(input: string, baseUrl: string): string | null {
  const rawInput = input.trim();

  if (
    rawInput.length === 0 ||
    rawInput.startsWith("#") ||
    rawInput.startsWith("mailto:") ||
    rawInput.startsWith("tel:") ||
    rawInput.startsWith("javascript:")
  ) {
    return null;
  }

  try {
    const url = new URL(rawInput, baseUrl);
    return normalizeScanUrl(url.toString());
  } catch {
    return null;
  }
}

export function isSameHostname(candidateUrl: string, referenceUrl: string): boolean {
  return new URL(candidateUrl).hostname === new URL(referenceUrl).hostname;
}
