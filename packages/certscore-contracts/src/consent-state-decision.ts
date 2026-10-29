/** Canonical, bounded decision decoding. Receipt IDs and UI state are not decisions. */
export type ConsentStateDecision = "granted" | "denied" | "mixed" | "unknown";

const CONSENT_STATE_KEY = /^(?:(?:[a-z0-9]+[_:-])*consent|consent[_-]?(?:state|decision|choice))$/i;
const GRANTED = new Set(["granted", "accepted", "accept_all", "accepted_all"]);
const DENIED = new Set(["denied", "rejected", "reject_all", "rejected_all", "necessary_only", "essential_only"]);

type UnverifiedReason = "receipt_malformed" | "receipt_format_unsupported" | "group_universe_incomplete";
export function decodeCanonicalConsentDecision(key: string, value: string, registeredConsentState = false,
  onUnverified?: (reason: UnverifiedReason) => void): ConsentStateDecision {
  const unverified = (reason: UnverifiedReason): "unknown" => { onUnverified?.(reason); return "unknown"; };
  if (value.length > 2_048) return unverified("receipt_format_unsupported");
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Use the original bounded value. */ }
  if (key === "cookieyes-consent") return decodeCookieYesDecision(decoded, unverified);
  if (/^OptanonConsent(?:_[a-zA-Z0-9_-]+)?$/.test(key) && decoded.includes("groups=")) {
    const groups = new URLSearchParams(decoded).getAll("groups");
    if (groups.length !== 1) return unverified("receipt_malformed");
    const values = groups[0]!.split(",").map((entry) => entry.split(":"));
    if (values.length > 32) return unverified("receipt_format_unsupported");
    if (values.some(([id, state, extra]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(id ?? "") || !["0", "1"].includes(state ?? "") || extra !== undefined)) return unverified("receipt_malformed");
    if (values.some(([id]) => !/^C000[1-5]$/.test(id ?? ""))) return unverified("receipt_format_unsupported");
    if (new Set(values.map(([id]) => id)).size !== values.length) return unverified("receipt_malformed");
    const optional = values.filter(([id]) => id !== "C0001");
    return optional.length ? summarizeDecisions(optional.map(([, state]) => state === "1")) : unverified("group_universe_incomplete");
  }
  if (key === "CookieConsent" && decoded.trim().startsWith("{")) {
    try {
      // Cookiebot's documented value is a JS-style object, not executable input.
      const json = decoded.replace(/([{,])\s*([a-zA-Z]+)\s*:/g, '$1"$2":').replace(/'([^'\\]*)'/g, (_match, text: string) => JSON.stringify(text));
      const state = JSON.parse(json) as Record<string, unknown>;
      // Only the documented flat-object form is supported. JSON.parse alone
      // would silently accept contradictory duplicate fields (including escapes).
      if (!state || Array.isArray(state) || Object.values(state).some((value) => value !== null && typeof value === "object")) return unverified("receipt_format_unsupported");
      const keys = [...json.matchAll(/("(?:\\.|[^"\\])*")\s*:/g)].map((match) => JSON.parse(match[1]!) as string);
      if (new Set(keys).size !== keys.length) return unverified("receipt_malformed");
      const values = [state.preferences, state.statistics, state.marketing];
      return values.every((value) => typeof value === "boolean") ? summarizeDecisions(values as boolean[]) : unverified("group_universe_incomplete");
    } catch { return unverified("receipt_malformed"); }
  }
  if (!registeredConsentState && (!CONSENT_STATE_KEY.test(key) || /analytics|marketing|advertising|tracking|opt.?out/i.test(key))) return unverified("receipt_format_unsupported");
  const normalized = decoded.trim().toLowerCase().replaceAll("-", "_");
  if (GRANTED.has(normalized)) return "granted";
  if (DENIED.has(normalized)) return "denied";
  // Do not infer an all-purpose decision from arbitrary JSON, one category,
  // an opt-out flag, a boolean, or words embedded in an unrelated receipt.
  return unverified("receipt_format_unsupported");
}

function summarizeDecisions(values: boolean[]): ConsentStateDecision {
  return values.length === 0 ? "unknown" : values.every(Boolean) ? "granted"
    : values.every((value) => !value) ? "denied" : "mixed";
}

function decodeCookieYesDecision(value: string, unverified: (reason: UnverifiedReason) => "unknown"): ConsentStateDecision {
  const entries = value.split(",").map((part) => part.split(":"));
  if (entries.length > 24) return unverified("receipt_format_unsupported");
  if (entries.some((part) => part.length !== 2)) return unverified("receipt_malformed");
  const fields = new Map<string, string>();
  for (const [key, decision] of entries) {
    if (fields.has(key!)) return unverified("receipt_malformed");
    fields.set(key!, decision!);
  }
  if (!fields.has("analytics") || !fields.has("advertisement")) return unverified("group_universe_incomplete");
  const metadata = new Set(["consentid", "consent", "necessary", "action"]);
  const categories = new Set(["analytics", "advertisement", "functional", "performance", "other"]);
  const states: string[] = [];
  for (const [key, decision] of fields) {
    if (metadata.has(key)) continue;
    if (!categories.has(key)) return unverified("receipt_format_unsupported");
    if (!["yes", "no"].includes(decision)) return unverified("receipt_malformed");
    states.push(decision);
  }
  return states.every((state) => state === "yes") ? "granted"
    : states.every((state) => state === "no") ? "denied" : "mixed";
}
