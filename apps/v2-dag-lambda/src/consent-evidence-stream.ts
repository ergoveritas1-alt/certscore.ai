import type { InvokeWithResponseStreamCommandOutput } from "@aws-sdk/client-lambda";
import type { LocalConsentEvidenceReady } from "./handler.js";

export async function readConsentEvidenceWorkerStream(
  response: InvokeWithResponseStreamCommandOutput,
  onReady: (notice: LocalConsentEvidenceReady) => void,
): Promise<Buffer> {
  if (response.StatusCode !== 200 || !response.EventStream) throw new Error("Consent worker stream unavailable.");
  let pending: Buffer = Buffer.alloc(0);
  let final: Buffer | undefined;
  let bytes = 0;
  let sawReady = false;
  let completed = false;
  for await (const event of response.EventStream) {
    if (completed) throw new Error("Consent worker stream continued after completion.");
    if (event.InvokeComplete) {
      if (event.InvokeComplete.ErrorCode) throw new Error("Consent worker stream failed.");
      completed = true;
      continue;
    }
    if (!event.PayloadChunk?.Payload) throw new Error("Invalid consent worker stream event.");
    const chunk = event.PayloadChunk.Payload;
    bytes += chunk.byteLength;
    if (bytes > 524_288) throw new Error("Consent worker stream exceeds its byte limit.");
    pending = Buffer.concat([pending, chunk]);
    for (let newline = pending.indexOf(10); newline >= 0; newline = pending.indexOf(10)) {
      const frame = JSON.parse(pending.subarray(0,newline).toString("utf8"));
      pending = pending.subarray(newline+1);
      if (frame?.kind === "ready" && !sawReady && !final && frame.receipt && typeof frame.receipt === "object" &&
          JSON.stringify(frame.receipt).length <= 4096) {
        sawReady = true;
        onReady(frame.receipt);
      } else if (frame?.kind === "result" && !final && frame.result && typeof frame.result === "object") {
        final = Buffer.from(JSON.stringify(frame.result));
      } else {
        throw new Error("Unexpected consent worker stream frame.");
      }
    }
  }
  if (!completed || pending.length !== 0 || !final) throw new Error("Consent worker stream ended before its terminal result.");
  return final;
}
