import { createHash } from "node:crypto";
import type { ExactCookieWriteEvidence } from "@certscore/contracts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
/** Uses existing setter readback or response headers. No cookie values leave this function. */
export function captureExactCookieWrite(input: {
  assignment: string; url: string; observedAtMs: number; source: ExactCookieWriteEvidence["source"];
}): ExactCookieWriteEvidence | undefined {
  if (input.assignment.length > 4096 || /[\r\n]/.test(input.assignment)) return undefined;
  let url: URL;
  try { url = new URL(input.url); } catch { return undefined; }
  if (!["http:","https:"].includes(url.protocol)) return undefined;
  const [pair, ...attributes] = input.assignment.split(";");
  const separator = pair!.indexOf("=");
  if (separator < 1) return undefined;
  const name = pair!.slice(0,separator).trim(), value = pair!.slice(separator+1).trim();
  if (!name || name.length > 180 || value.length > 2048 || /[\s=,]/.test(name)) return undefined;
  let hostname = url.hostname, path = url.pathname.slice(0,url.pathname.lastIndexOf("/")) || "/";
  const seen = new Set<string>();
  let maxAge: number | undefined, expires: number | undefined;
  for (const attribute of attributes) {
    const offset = attribute.indexOf("="), key = (offset<0?attribute:attribute.slice(0,offset)).trim().toLowerCase();
    const v = offset<0?"":attribute.slice(offset+1).trim();
    if (seen.has(key)) return undefined; seen.add(key);
    if (key === "partitioned") return undefined; // No exact partition ownership from these APIs.
    if (key === "domain") {
      hostname = v.toLowerCase().replace(/^\./, "");
      if (!hostname || hostname.length>255 || !/^[a-z0-9.-]+$/.test(hostname) ||
        !(url.hostname===hostname||url.hostname.endsWith(`.${hostname}`))) return undefined;
    }
    if (key === "path") { if (!v.startsWith("/") || v.length>500) return undefined; path=v; }
    if (key === "max-age") { if (!/^-?[0-9]+$/.test(v)) return undefined; maxAge=Number(v); }
    if (key === "expires") { expires=Date.parse(v); if (!Number.isFinite(expires)) return undefined; }
  }
  if (maxAge !== undefined ? maxAge <= 0 : expires !== undefined && expires <= Date.now()) return undefined;
  return {policyVersion:"exact_cookie_write_evidence.v1",source:input.source,acceptance:"not_independently_verified",
    name,hostname,identityHash:sha(JSON.stringify(["cookie_name_domain_path_partition",hostname,path,"",name])),
    valueHash:sha(value),observedAtMs:input.observedAtMs};
}
