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
      try { fields = [...new Set(new URLSearchParams(body).keys())]; } catch { /* Unknown fields. */ }
    }
  }
  return { body, signals: { bodyPresent: true, bodySizeBytes: Buffer.byteLength(body), bodyFieldNames: fields } };
}
