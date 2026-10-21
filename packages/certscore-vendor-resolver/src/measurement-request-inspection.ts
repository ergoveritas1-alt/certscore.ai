import type { MeasurementRequestEvidence, MeasurementStoredIdentifier } from "@certscore/contracts";
import { COOKIE_PURPOSE_POLICY, resolveCanonicalCookieKnowledge } from "./cookie-knowledge-base";
import { isCanonicalGoogleAnalyticsCollectionUrl, resolveCanonicalVendor } from "./index";

const MAX_BODY_BYTES = 32_768;
// Closed protocol fields, not a vendor-wide exemption. Client IDs remain unknown.
const GA_FIELDS = new Set(["v", "tid", "gcs", "gcd", "npa", "en", "dl", "dr", "dt", "ul", "sr", "_p", "_s", "_et", "_ee", "_fv", "_ss", "_nsi", "_dbg", "gtm", "dma", "dma_cps", "tag_exp", "tfd"]);
const RUM_METRICS = new Set(["eventType", "firstPaint", "firstContentfulPaint", "startTime", "st", "dt", "duration", "lcp", "fid", "cls", "fcp", "ttfb", "inp", "FCP", "LCP", "CLS", "TTFB", "INP"]);
const RUM_OBJECTS = new Set(["memory", "nt", "timingsV2", "timingV2", "timings"]);
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const RUM_NUMERIC_FIELDS = new Set([...RUM_METRICS, "totalJSHeapSize", "usedJSHeapSize", "jsHeapSizeLimit",
  "navigationStart", "unloadEventStart", "unloadEventEnd", "redirectStart", "redirectEnd", "fetchStart", "domainLookupStart", "domainLookupEnd",
  "connectStart", "connectEnd", "secureConnectionStart", "requestStart", "responseStart", "responseEnd", "domLoading", "domInteractive",
  "domContentLoadedEventStart", "domContentLoadedEventEnd", "domComplete", "loadEventStart", "loadEventEnd", "transferSize", "encodedBodySize",
  "decodedBodySize", "redirectCount", "activationStart", "workerStart", "responseStatus", "fetchStart", "criticalCHRestart"]);
function numericTree(value: unknown, depth = 0): boolean {
  return typeof value === "number" ? Number.isFinite(value) : depth < 3 && plain(value) && Object.keys(value).length <= 64 &&
    Object.entries(value).every(([key, child]) => RUM_NUMERIC_FIELDS.has(key) && numericTree(child, depth + 1));
}
function unadornedUrl(value: unknown) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.search && !url.hash && !url.username && !url.password; } catch { return false; }
}
function navigationTiming(value: unknown): boolean {
  if (!plain(value) || Object.keys(value).length > 64) return false;
  return Object.entries(value).every(([key, field]) => {
    if (RUM_NUMERIC_FIELDS.has(key)) return typeof field === "number" && Number.isFinite(field);
    if (key === "name") return unadornedUrl(field);
    if (key === "entryType" || key === "initiatorType") return field === "navigation";
    if (key === "nextHopProtocol") return ["", "h2", "h3", "http/1.1"].includes(String(field));
    if (key === "type") return ["navigate", "reload", "back_forward", "prerender"].includes(String(field));
    if (key === "deliveryType") return ["", "cache", "navigational-prefetch"].includes(String(field));
    if (key === "serverTiming") return Array.isArray(field) && field.length === 0;
    return key === "notRestoredReasons" && field === null;
  });
}
function paintTimings(value: unknown) {
  return Array.isArray(value) && value.length <= 4 && value.every(entry => plain(entry) &&
    Object.keys(entry).every(key => ["name", "entryType", "startTime", "duration"].includes(key)) &&
    ["first-paint", "first-contentful-paint"].includes(String(entry.name)) && entry.entryType === "paint" &&
    typeof entry.startTime === "number" && Number.isFinite(entry.startTime) && typeof entry.duration === "number" && Number.isFinite(entry.duration));
}

function rumPayload(value: unknown) {
  if (!plain(value) || Object.keys(value).length > 32 || !Object.keys(value).some(key => RUM_METRICS.has(key) || RUM_OBJECTS.has(key))) return false;
  return Object.entries(value).every(([key, field]) => {
    if (key === "firstPaint" && Array.isArray(field)) return paintTimings(field);
    if (RUM_METRICS.has(key)) return typeof field === "number" && Number.isFinite(field);
    if (RUM_OBJECTS.has(key)) return key === "memory" ? numericTree(field) : navigationTiming(field);
    if (["location", "referrer", "landingPath"].includes(key)) return unadornedUrl(field);
    if (["pageloadId", "previousPageloadId", "siteToken"].includes(key)) return typeof field === "string" && /^[a-f0-9-]{0,64}$/i.test(field);
    if (key === "versions") return plain(field) && Object.keys(field).length <= 4 && Object.entries(field).every(([name, version]) =>
      ["fl", "js", "timings"].includes(name) && /^(?:[0-9a-f.-]{1,64})$/i.test(String(version)));
    return ["resources", "serverTimings"].includes(key) && Array.isArray(field) && field.length === 0;
  });
}

/** Called only on fresh producer requests, before URL redaction. Raw values never leave this function. */
export function inspectMeasurementRequest(input: { url: string; method: string; requestId: string; timestampMs: number;
  body: string | null; headers?: Record<string, string>; storedIdentifiers?: readonly MeasurementStoredIdentifier[];
  hashIdentifier?: (value: string) => string }): MeasurementRequestEvidence | undefined {
  if (input.url.length > 8192) return undefined;
  let url: URL;
  try { url = new URL(input.url); } catch { return undefined; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname.length > 255) return undefined;
  const service = resolveCanonicalVendor({ type: "request", url: input.url }).observation;
  const ga = isCanonicalGoogleAnalyticsCollectionUrl(input.url);
  // Exact reviewed collection endpoint and canonical service must both match.
  const rum = service?.product === "Cloudflare Web Analytics" && url.hostname === "cloudflareinsights.com" && url.pathname === "/cdn-cgi/rum";
  if (!ga && !rum) return undefined;
  const method = ["GET", "POST", "OPTIONS"].includes(input.method) ? input.method as "GET" | "POST" | "OPTIONS" : "other";
  let complete = false;
  let identifierEvidence: MeasurementRequestEvidence["identifierEvidence"] = "unknown";
  let cookieIdentifierBinding: MeasurementStoredIdentifier | undefined;
  const reasons = new Set<NonNullable<MeasurementRequestEvidence["diagnostics"]>["reasons"][number]>();
  const bodyWithinLimit = input.body === null || input.body.length <= MAX_BODY_BYTES && new TextEncoder().encode(input.body).length <= MAX_BODY_BYTES;
  let bodyDisposition: NonNullable<MeasurementRequestEvidence["diagnostics"]>["bodyDisposition"] = !input.body ? "empty" : bodyWithinLimit ? "inspected" : "limited";
  if (!bodyWithinLimit) reasons.add("payload_size_limit");
  if (bodyWithinLimit) {
    if (ga) {
      const query = [...url.searchParams];
      // Bounded form-encoded event lines. Common query fields apply to each line;
      // repeated fields within one event remain ambiguous. Never decode JSON as a
      // browser collect protocol or turn opaque cid/sid into transient IDs.
      const lines = input.body ? input.body.split(/\r?\n/) : [""];
      const bodySupported = lines.length <= 8 && lines.every(line => !/[{}\r]/.test(line) && !/%(?![a-f0-9]{2})/i.test(line));
      const bodyFields = bodySupported ? lines.map(line => [...new URLSearchParams(line)]) : [];
      const fields = [...query, ...bodyFields.flat()];
      const withinFieldLimit = fields.length <= 64;
      if (!bodySupported) { reasons.add("unsupported_payload"); bodyDisposition = "limited"; }
      if (!withinFieldLimit) reasons.add("field_limit");
      const events = bodySupported ? bodyFields.map(fields => [...query, ...fields]) : [];
      const duplicate = events.some(event => new Set(event.map(([key]) => key)).size !== event.length);
      if (duplicate) reasons.add("duplicate_fields");
      const opaque = fields.some(([key, value]) => ["cid", "sid"].includes(key) && value !== "");
      const unsupported = fields.some(([key, value]) => !GA_FIELDS.has(key) && !["cid", "sid"].includes(key) ||
        ["dl", "dr"].includes(key) && !unadornedUrl(value));
      if (unsupported) reasons.add("unsupported_fields");
      complete = bodySupported && withinFieldLimit && !duplicate && !opaque && !unsupported;
      if (fields.some(([key, value]) => /^(?:uid|user_id|device_id|gclid|dclid|fbclid)$/.test(key) && value !== "")) identifierEvidence = "persistent_observed";
      else if (withinFieldLimit && bodySupported && !duplicate) {
        const clientIds = [...new Set(fields.filter(([key, value]) => key === "cid" && value !== "").map(([, value]) => value))];
        if (clientIds.length === 1 && input.hashIdentifier && input.storedIdentifiers?.length) {
          const identifierSha256 = input.hashIdentifier(clientIds[0]!);
          const matches = (input.storedIdentifiers ?? []).filter(row => row.identifierSha256 === identifierSha256 && row.capturedAtMs <= input.timestampMs);
          if (matches.length === 1) { cookieIdentifierBinding = matches[0]; identifierEvidence = "persistent_observed"; }
        }
        if (identifierEvidence !== "persistent_observed" && complete) identifierEvidence = "not_observed";
      }
      if (opaque && (!cookieIdentifierBinding || fields.some(([key, value]) => key === "sid" && value !== ""))) reasons.add("ambiguous_client_identifier");
    } else if (method === "POST" && !url.search && input.body) {
      try { complete = rumPayload(JSON.parse(input.body)); } catch { /* Unknown payload remains review. */ }
      if (complete) identifierEvidence = "not_observed";
      else reasons.add("unsupported_payload");
    } else reasons.add("unsupported_payload");
  }
  const allowedHeaders = /^(?:accept(?:-encoding|-language)?|authorization|cache-control|connection|content-(?:length|type)|cookie|dnt|host|origin|pragma|priority|referer|sec-ch-ua(?:-mobile|-platform)?|sec-fetch-(?:dest|mode|site|user)|sec-gpc|upgrade-insecure-requests|user-agent)$/i;
  if (input.headers && (Object.keys(input.headers).length > 64 || Object.entries(input.headers).some(([key, value]) =>
    !allowedHeaders.test(key) || value.length > 8192 || key.toLowerCase() === "referer" && !unadornedUrl(value)))) { complete = false; reasons.add("unsupported_headers"); }
  if (!input.headers) reasons.add("headers_unavailable");
  if (input.body === null && Object.entries(input.headers ?? {}).some(([key, value]) => key.toLowerCase() === "content-length" && value !== "0")) {
    complete = false; reasons.add("body_unavailable"); bodyDisposition = "limited";
  }
  const header = (key: string) => !input.headers ? "unknown" as const : Object.entries(input.headers).some(([name, value]) => name.toLowerCase() === key && value.trim() !== "") ? "present" as const : "absent" as const;
  if (!complete && identifierEvidence === "not_observed") identifierEvidence = "unknown";
  const cookieNames = Object.entries(input.headers ?? {}).filter(([key]) => key.toLowerCase() === "cookie")
    .flatMap(([, value]) => value.slice(0, 8192).split(";").map(part => part.split("=", 1)[0]!.trim()));
  if (cookieNames.some(name => {
    const knowledge = resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY, cookieDomain: url.hostname });
    return knowledge.essentiality === "non_essential" && ["analytics", "advertising", "session_replay"].includes(knowledge.category);
  })) identifierEvidence = "persistent_observed";
  return { version: "measurement_request_evidence.v2", requestId: input.requestId, timestampMs: input.timestampMs,
    requestOrigin: url.origin, requestPath: url.pathname, profile: ga ? "google_analytics_collection.v1" : "cloudflare_rum.v1",
    method, payloadInspection: complete ? "complete" : "unknown", identifierEvidence,
    cookieHeader: header("cookie"), authorizationHeader: header("authorization"),
    ...(cookieIdentifierBinding ? { cookieIdentifierBinding } : {}),
    diagnostics: { policyVersion: "bounded_measurement_inspection.v1", reasons: [...reasons], bodyDisposition } };
}
