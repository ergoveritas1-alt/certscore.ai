/** Display projection only. Never rewrite the retained request used for source
 * hashes, endpoint qualification, consent signals or recipient attribution. */
export const EVIDENCE_REQUEST_URL_POLICY = "evidence_request_url.v1";

export function sanitizeEvidenceRequestPath(pathname: string): string {
  let previousIsIdentity = false;
  return pathname.split("/").map(part => {
    let decoded = part;
    try { for (let n = 0; n < 2; n++) { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } }
    catch { return "_redacted_"; }
    const identityValue = previousIsIdentity;
    previousIsIdentity = /^(?:uid|uuid|dpuuid|userid|user_id|visitorid|visitor_id|email|token|sessionid|session_id)$/i.test(decoded);
    // Matrix parameters and Adobe-style key=value path segments carry values
    // just as query parameters do. Preserve the parameter names, never values.
    if (decoded.includes("=")) return decoded.replace(/([^/;&=]+)=([^;&]*)/g, (_all, key: string) =>
      `${/^[a-z0-9_.:-]{1,80}$/i.test(key) ? key : "parameter"}=[redacted]`);
    return identityValue || /@|[\u0000-\u001f\u007f]|\d{6,}/.test(decoded) || decoded.length > 80 ||
      /^[a-f0-9-]{24,}$/i.test(decoded) ? "_redacted_" : part;
  }).join("/").slice(0, 1000);
}

export function sanitizeEvidenceRequestUrl(value: unknown, options: {query?: "keys" | "marker" | "omit"} = {}): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return undefined;
    const keys = [...new Set(url.searchParams.keys())].slice(0, 16)
      .map(key => /^[a-z0-9_.:-]{1,80}$/i.test(key) ? encodeURIComponent(key) : "parameter");
    const query = options.query === "omit" || !keys.length ? "" : options.query === "marker" ? "?redacted=1" :
      `?${keys.map(key => `${key}=[redacted]`).join("&")}`;
    return `${url.origin}${sanitizeEvidenceRequestPath(url.pathname)}${query}`.slice(0, 1800);
  } catch { return undefined; }
}
