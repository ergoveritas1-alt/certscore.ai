/** Canonical, bounded decision decoding. Receipt IDs and UI state are not decisions. */
export type ConsentStateDecision = "granted" | "denied" | "mixed" | "unknown";

const CONSENT_STATE_KEY = /^(?:(?:[a-z0-9]+[_:-])*consent|consent[_-]?(?:state|decision|choice))$/i;
const GRANTED = new Set(["granted", "accepted", "accept_all", "accepted_all"]);
const DENIED = new Set(["denied", "rejected", "reject_all", "rejected_all", "necessary_only", "essential_only"]);

export function decodeCanonicalConsentDecision(key: string, value: string, registeredConsentState = false): ConsentStateDecision {
  if (value.length > 2_048) return "unknown";
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Use the original bounded value. */ }
  if (key === "cookieyes-consent") return decodeCookieYesDecision(decoded);
  if (/^OptanonConsent(?:_[a-zA-Z0-9_-]+)?$/.test(key) && decoded.includes("groups=")) {
    const groups = new URLSearchParams(decoded).getAll("groups");
    if (groups.length !== 1) return "unknown";
    const values = groups[0]!.split(",").map((entry) => entry.split(":"));
    if (values.length > 32 || values.some(([id, state, extra]) => !/^C000[1-5]$/.test(id ?? "") || !["0", "1"].includes(state ?? "") || extra !== undefined)) return "unknown";
    if (new Set(values.map(([id]) => id)).size !== values.length) return "unknown";
    return summarizeDecisions(values.filter(([id]) => id !== "C0001").map(([, state]) => state === "1"));
  }
  if (key === "CookieConsent" && decoded.trim().startsWith("{")) {
    try {
      // Cookiebot's documented value is a JS-style object, not executable input.
      const json = decoded.replace(/([{,])\s*([a-zA-Z]+)\s*:/g, '$1"$2":').replace(/'([^'\\]*)'/g, (_match, text: string) => JSON.stringify(text));
      const state = JSON.parse(json) as Record<string, unknown>;
      // Only the documented flat-object form is supported. JSON.parse alone
      // would silently accept contradictory duplicate fields (including escapes).
      if (!state || Array.isArray(state) || Object.values(state).some((value) => value !== null && typeof value === "object")) return "unknown";
      const keys = [...json.matchAll(/("(?:\\.|[^"\\])*")\s*:/g)].map((match) => JSON.parse(match[1]!) as string);
      if (new Set(keys).size !== keys.length) return "unknown";
      const values = [state.preferences, state.statistics, state.marketing];
      return values.every((value) => typeof value === "boolean") ? summarizeDecisions(values as boolean[]) : "unknown";
    } catch { return "unknown"; }
  }
  if (!registeredConsentState && (!CONSENT_STATE_KEY.test(key) || /analytics|marketing|advertising|tracking|opt.?out/i.test(key))) return "unknown";
  const normalized = decoded.trim().toLowerCase().replaceAll("-", "_");
  if (GRANTED.has(normalized)) return "granted";
  if (DENIED.has(normalized)) return "denied";
  // Do not infer an all-purpose decision from arbitrary JSON, one category,
  // an opt-out flag, a boolean, or words embedded in an unrelated receipt.
  return "unknown";
}

function summarizeDecisions(values: boolean[]): ConsentStateDecision {
  return values.length === 0 ? "unknown" : values.every(Boolean) ? "granted"
    : values.every((value) => !value) ? "denied" : "mixed";
}

function decodeCookieYesDecision(value: string): ConsentStateDecision {
  const entries = value.split(",").map((part) => part.split(":"));
  if (entries.length > 24 || entries.some((part) => part.length !== 2)) return "unknown";
  const fields = new Map<string, string>();
  for (const [key, decision] of entries) {
    if (fields.has(key!)) return "unknown";
    fields.set(key!, decision!);
  }
  if (!fields.has("analytics") || !fields.has("advertisement")) return "unknown";
  const metadata = new Set(["consentid", "consent", "necessary", "action"]);
  const categories = new Set(["analytics", "advertisement", "functional", "performance", "other"]);
  const states: string[] = [];
  for (const [key, decision] of fields) {
    if (metadata.has(key)) continue;
    if (!categories.has(key) || !["yes", "no"].includes(decision)) return "unknown";
    states.push(decision);
  }
  return states.every((state) => state === "yes") ? "granted"
    : states.every((state) => state === "no") ? "denied" : "mixed";
}
