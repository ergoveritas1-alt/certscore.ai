import type { NetworkEvent } from "@certscore/contracts";

/** A body read is optional metadata, never a prerequisite for retaining a request.
 * Undefined means unavailable; only a successful empty read establishes absence. */
export function readRuntimeRequestPayload(request: { postData(): string | null }): {
  body: string | null | undefined;
  signals: NetworkEvent["requestPayloadSignals"];
} {
  let body: string | null;
  try { body = request.postData(); }
  catch { return { body: undefined, signals: undefined }; }
  if (!body) return { body, signals: { bodyPresent: false, bodyFieldNames: [] } };
  let fields: string[] = [];
  if (body.length <= 20_000) {
    let objectFields = false;
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) { fields = Object.keys(parsed); objectFields = true; }
    } catch { /* Try the existing form-field interpretation. */ }
    if (!objectFields) {
      // A bare/encoded envelope is not a form field name. This metadata never
      // gates the independent request proof or changes the ephemeral body.
      const opaque = !body.includes("&") && /^[A-Za-z0-9+/]+={0,2}$/.test(body) &&
        body.length % 4 === 0 && Buffer.from(body,"base64").toString("base64") === body;
      if (body.includes("=") && !opaque && !/^[\s]*[\[{]/.test(body)) {
        try { fields = [...new Set(new URLSearchParams(body).keys())]; } catch { /* Unknown fields. */ }
      }
    }
  }
  fields = fields.filter(field => /^[A-Za-z_$][\w.$-]{0,63}$/.test(field)).slice(0,32);
  return { body, signals: { bodyPresent: true, bodySizeBytes: Buffer.byteLength(body), bodyFieldNames: fields } };
}
