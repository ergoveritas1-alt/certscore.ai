import { readBoundedProtocolJson, type ProtocolJson } from "./bounded-protocol-json";

/** mixpanel-js _encode_data_for_request/_send_request: exact track endpoint,
 * JSON object/batch or data=<JSON/canonical base64>. No identity or purpose is
 * inferred from a custom property. Payloads never leave this bounded decoder. */
export function isMixpanelTrack(url: URL): boolean {
  return ["https://api.mixpanel.com", "https://api-js.mixpanel.com"].includes(url.origin) && /^\/track\/?$/.test(url.pathname);
}

const object = (value: ProtocolJson): value is Record<string, ProtocolJson> => value !== null && typeof value === "object" && !Array.isArray(value);
const processing = new Set(["gpp", "gpp_sid", "us_privacy", "rdp", "npa", "ltd", "dpo", "data_processing_options", "opt_out", "optOut", "du", "data_use", "limited_data_use"]);
function fail(code = "unsupported_fields"): never { throw Error(code); }

export function decodeMixpanelBody(url: URL, body: string, processingOnly = false) {
  if (!isMixpanelTrack(url)) return null;
  let text = body.trim(), format: "json" | "form" = "json";
  if (new TextEncoder().encode(body).length > 32768) fail("body_limit");
  if (!text.startsWith("{") && !text.startsWith("[")) {
    if (/%(?![a-f0-9]{2})/i.test(text)) fail("unsupported_body");
    const form = new URLSearchParams(text);
    if ([...form].length !== 1 || form.getAll("data").length !== 1) fail("unsupported_body");
    text = form.get("data")!; format = "form";
    if (!text.startsWith("{") && !text.startsWith("[")) {
      if (!text || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail("unsupported_body");
      const decoded = atob(text);
      if (btoa(decoded) !== text) fail("unsupported_body");
      text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(decoded, char => char.charCodeAt(0)));
    }
  }
  const root = readBoundedProtocolJson(text, [...url.searchParams].length);
  const events = Array.isArray(root) ? root : [root];
  if (!events.length || events.length > 16) fail("body_limit");
  const fields = new URLSearchParams();
  for (const event of events) {
    if (!object(event)) fail();
    if (!processingOnly && (typeof event.event !== "string" || !event.event || !object(event.properties ?? null))) fail();
    for (const [key, value] of Object.entries(event)) {
      if (processing.has(key)) {
        fields.append(key, value === null || typeof value === "object" ? "[invalid]" : String(value));
      } else if (key !== "event" && key !== "properties" && !processingOnly) fail();
    }
    if (object(event.properties ?? null)) for (const [key, value] of Object.entries(event.properties as Record<string, ProtocolJson>)) {
      if (processing.has(key)) fields.append(key, value === null || typeof value === "object" ? "[invalid]" : String(value));
      else if (!processingOnly && (value !== null && typeof value === "object" || /privacy|consent|opt.?out|processing/i.test(key))) fail();
    }
  }
  if (!processingOnly) for (const key of new Set(fields.keys())) if (fields.getAll(key).length !== 1) fail("duplicate_fields");
  return { fields, format };
}
