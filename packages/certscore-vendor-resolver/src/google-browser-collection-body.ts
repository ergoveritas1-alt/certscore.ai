import {protocolLimit} from "./protocol-limit";
/** Browser gtag transport, not the server-side Measurement Protocol. The
 * reviewed Google tag serializes event records with CRLF and shares URL fields.
 * Parsing records never establishes advertising purpose or consent honoring. */
const origins = new Set([
  "https://www.google-analytics.com", "https://google-analytics.com",
  "https://analytics.google.com", "https://region1.analytics.google.com",
  "https://region1.google-analytics.com",
]);
export function isGoogleBrowserCollection(url: URL): boolean {
  return origins.has(url.origin) && url.pathname === "/g/collect";
}
const metadata = new Set(("v tid cid uid en _p _s _ee _et _ss _fv _nsi sid sct seg dl dr dt ul sr " +
  "uaa uab uafvl uamb uam uap uapv uaw are frm pscdl gtm gcs gcd gcu gcut dma dma_cps " +
  "npa rdp ltd gpp gpp_sid us_privacy tag_exp dbg _dbg cu developer_id _eu _tu _gaz _rdi _slc").split(" "));
const projected = new Set(["v", "tid", "cid", "rdp", "npa", "ltd", "gpp", "gpp_sid", "us_privacy"]);
const restrictions = new Set(["rdp", "npa", "ltd", "gpp", "gpp_sid", "us_privacy"]);
const fail = (code = "unsupported_body"): never => { throw Error(code); };

function records(url: URL, body: string, partial = false): URLSearchParams[] {
  if (new TextEncoder().encode(body).length > 32768) protocolLimit("bytes");
  if (!body || /[\x00-\x08\x0b\x0c\x0e-\x1f{}\[\]]/.test(body) || /%(?![a-f0-9]{2})/i.test(body)) fail();
  const lines = body.split(/\r\n|\n/);
  if (lines.length > 16) protocolLimit("event_records");
  if (lines.some(line => !line || line.includes("\r") || line.split("&").some(field => !field || !field.includes("=")))) fail();
  const query = [...url.searchParams];
  if (!partial && new Set(query.map(([key]) => key)).size !== query.length) fail("duplicate_fields");
  const result = lines.map(line => new URLSearchParams(line));
  if (query.length + result.reduce((n, row) => n + [...row].length, 0) > 128) protocolLimit("fields");
  for (const row of result) {
    const keys = [...row.keys()];
    if (!partial && (new Set(keys).size !== keys.length || keys.some(key => url.searchParams.has(key)))) fail("duplicate_fields");
    // An event is routed on this same record or the shared URL, never inferred
    // from a different record. Routing IDs remain distinct from visitor IDs.
    if (!partial && !(row.get("en") || url.searchParams.get("en"))) fail();
  }
  return result;
}

export function decodeGoogleBrowserCollectionBody(url: URL, body: string): { fields: URLSearchParams; format: "form" } | null {
  if (!isGoogleBrowserCollection(url)) return null;
  if (new TextEncoder().encode(body).length > 32768) protocolLimit("bytes");
  // Keep previously supported flat JSON and body-only non-event proofs on
  // their existing generic decoder path.
  if (body.trim().startsWith("{") || !/[\r\n]/.test(body) && !new URLSearchParams(body).has("en") && !url.searchParams.has("en")) return null;
  const rows = records(url, body);
  if (rows.some(row => (url.searchParams.get("v") ?? row.get("v")) !== "2" || !/^G-[A-Z0-9]{4,60}$/.test(url.searchParams.get("tid") ?? row.get("tid") ?? ""))) fail();
  for (const row of rows) for (const key of row.keys()) {
    if (!metadata.has(key) && !/^(?:ep|epn|up|upn)\.[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(key) && !/^pr[1-9][0-9]?$/.test(key)) fail("unsupported_fields");
  }
  const fields = new URLSearchParams();
  for (const key of projected) {
    const values = rows.map(row => row.get(key));
    if (values.every(value => value === null)) continue;
    // Never union one event's identifier with another event's restrictions.
    if (new Set(values).size !== 1) fail("duplicate_fields");
    fields.append(key, values[0]!);
  }
  return { fields, format: "form" };
}

/** Retain positively read restrictions even if unrelated metadata is unknown.
 * Repeated per-event declarations stay repeated/invalid instead of inventing
 * one effective privacy state. No identity is returned by this partial read. */
export function readGoogleBrowserProcessing(url: URL, body: string): URLSearchParams | null {
  if (!isGoogleBrowserCollection(url)) return null;
  try {
    const fields = new URLSearchParams();
    for (const row of records(url, body, true)) for (const [key, value] of row) if (restrictions.has(key)) fields.append(key, value);
    return fields;
  } catch { return null; }
}
