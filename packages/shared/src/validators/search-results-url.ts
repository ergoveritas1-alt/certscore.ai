import { normalizeUrl } from "../utils/url";

/** A prompt to check the target, never a replacement for URL or network validation. */
export function searchResultsScanTarget(value: string): string | null {
  try {
    const normalizedUrl = normalizeUrl(value);
    const url = new URL(normalizedUrl);
    const host = url.hostname.toLowerCase();
    const isSearchResults =
      ((host === "google.com" || host === "www.google.com") && url.pathname === "/search" && url.searchParams.has("q")) ||
      (host === "www.bing.com" && url.pathname === "/search" && url.searchParams.has("q")) ||
      (host === "duckduckgo.com" && url.pathname === "/" && url.searchParams.has("q")) ||
      (host === "search.yahoo.com" && url.pathname === "/search" && url.searchParams.has("p"));
    return isSearchResults ? normalizedUrl : null;
  } catch {
    return null;
  }
}

export function needsSearchResultsConfirmation(value: string, confirmation: unknown): boolean {
  const target = searchResultsScanTarget(value);
  return target !== null && confirmation !== target;
}
