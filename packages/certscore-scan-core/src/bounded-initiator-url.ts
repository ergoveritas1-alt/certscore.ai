import { createHash } from "node:crypto";

export const MAX_INITIATOR_URL_CHARS = 2_000;
export const MAX_INITIATOR_CHAIN_ENTRIES = 12;

const TRUNCATION_MARKER_PREFIX = "#certscore_truncated_sha256=";

export function boundedInitiatorUrl(
  value: string | null | undefined,
  maxChars = MAX_INITIATOR_URL_CHARS,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || maxChars <= 0) return undefined;

  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
  const marker = `${TRUNCATION_MARKER_PREFIX}${digest}`;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      const querySafeUrl = parsed.toString();
      if (querySafeUrl.length <= maxChars) return querySafeUrl;

      const origin = parsed.origin;
      const availablePathChars = Math.max(0, maxChars - origin.length - marker.length);
      return `${origin}${parsed.pathname.slice(0, availablePathChars)}${marker}`.slice(0, maxChars);
    }
  } catch {
    // Non-URL stack entries are retained as bounded diagnostic text below.
  }

  const querySafeValue = trimmed.split(/[?#]/, 1)[0]?.trim() ?? "";
  if (!querySafeValue) return undefined;
  if (querySafeValue.length <= maxChars) return querySafeValue;
  const availableChars = Math.max(0, maxChars - marker.length);
  return `${querySafeValue.slice(0, availableChars)}${marker}`.slice(0, maxChars);
}

export function boundedInitiatorChain(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const bounded: string[] = [];
  for (const value of values) {
    const candidate = boundedInitiatorUrl(value);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    bounded.push(candidate);
    if (bounded.length >= MAX_INITIATOR_CHAIN_ENTRIES) break;
  }
  return bounded;
}

export function withBoundedCookieInitiatorMetadata<
  T extends { initiatorChain?: string[]; setterScriptUrl?: string },
>(event: T): T {
  const initiatorChain = boundedInitiatorChain(event.initiatorChain ?? []);
  const setterScriptUrl = boundedInitiatorUrl(event.setterScriptUrl) ??
    initiatorChain.find((value) => /^https?:\/\//i.test(value));
  return {
    ...event,
    initiatorChain,
    setterScriptUrl,
  };
}
