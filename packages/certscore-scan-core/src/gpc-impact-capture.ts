import { createHash } from "node:crypto";
import { GPC_IMPACT_HORIZONS_MS, gpcImpactCaptureSchema, type GpcImpactCapture, type GpcSignalObservation, type NetworkEvent } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

type RequestIdentity = Pick<NetworkEvent, "eventId" | "timestampMs" | "requestUrl">;
export function gpcImpactRequestSetHash(events: RequestIdentity[]) {
  return createHash("sha256").update(JSON.stringify(events.map(e => [e.eventId, e.timestampMs, gpcDocumentHash(e.requestUrl)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

/** Uses the already-enabled metadata CDP session and existing request stream.
 * No browser calls, timers, polling, or waits are introduced. */
export function createGpcImpactCapture(input: { expectedEnabled: boolean; now: () => number; quietSnapshot?: () => {quietForMs: number; inFlightRequestCount: number} }) {
  const startedAt = input.now();
  const requests: RequestIdentity[] = [];
  let requestsDropped = 0;
  let document: GpcImpactCapture["document"] = null;
  // Unlike signal identity, history equivalence must preserve fragments too.
  let committedExactUrlSha256: string | undefined;
  let pending: { loader: string; urlHash: string; secGpc: string | null } | undefined;
  let invalid = false;
  type Reason = NonNullable<GpcImpactCapture["invalidationReasons"]>[number];
  const invalidationReasons = new Set<Reason>();
  const invalidate = (reason: Reason = "unspecified") => {
    if (!frozen) { invalid = true; invalidationReasons.add(reason); }
  };
  let frozen: GpcImpactCapture | undefined;
  let readbackDocumentToken: string | null = null;
  return {
    bindReadback(token: string | undefined) { if (!frozen) readbackDocumentToken = token ?? null; },
    documentRequested(p: { type?: string; frameId?: string; loaderId?: string; request?: { url?: string; headers?: Record<string, unknown> } }, mainFrameId: string) {
      if (frozen || p.type !== "Document" || p.frameId !== mainFrameId || !p.loaderId || !p.request?.url || !/^https?:/.test(p.request.url)) return;
      if (document) invalidate("document_requested_after_commit");
      const header = Object.entries(p.request.headers ?? {}).find(([k]) => k.toLowerCase() === "sec-gpc")?.[1];
      pending = { loader: p.loaderId, urlHash: gpcDocumentHash(p.request.url), secGpc: typeof header === "string" && header.length <= 8 ? header : null };
    },
    documentCommitted(frame: { parentId?: string; loaderId?: string; url?: string }) {
      if (frozen || frame.parentId || !frame.loaderId || !frame.url || !/^https?:/.test(frame.url)) return;
      if (document) invalidate("document_recommitted");
      if (!pending || pending.loader !== frame.loaderId || pending.urlHash !== gpcDocumentHash(frame.url)) { invalidate("commit_binding_mismatch"); return; }
      document = { token: frame.loaderId, urlSha256: pending.urlHash, committedAtMs: input.now(), secGpc: pending.secGpc };
      committedExactUrlSha256 = createHash("sha256").update(new URL(frame.url).href).digest("hex");
    },
    invalidate,
    navigatedWithinDocument(event: { url?: string; navigationType?: string }, documentToken: string | undefined) {
      if (frozen) return;
      if (!document || documentToken !== document.token || !event.url || event.navigationType !== "historyApi") {
        invalidate("same_document_identity_unverified");
      } else {
        try {
          if (createHash("sha256").update(new URL(event.url).href).digest("hex") !== committedExactUrlSha256) invalidate("same_document_url_changed");
        } catch { invalidate("same_document_identity_unverified"); }
      }
    },
    recordRequest(event: RequestIdentity) {
      if (frozen) return;
      if (requests.length >= 5000) { requestsDropped++; return; }
      requests.push({ eventId: event.eventId, timestampMs: event.timestampMs, requestUrl: event.requestUrl });
    },
    finish(proof?: GpcSignalObservation): GpcImpactCapture {
      if (frozen) return frozen;
      const capturedAtMs = input.now();
      const limits: string[] = [];
      if (invalid || !document || !proof || proof.documentUrlSha256 !== document.urlSha256 ||
        readbackDocumentToken !== document.token || proof.capturedAtMs < document.committedAtMs ||
        proof.capturedAtMs > capturedAtMs || proof.expectedEnabled !== input.expectedEnabled) limits.push("document_or_readback_unverified");
      if (requestsDropped) limits.push("request_capture_overflow");
      const windows = !limits.length && document ? GPC_IMPACT_HORIZONS_MS.filter(ms => proof!.capturedAtMs >= document!.committedAtMs + ms).map(durationMs => {
        const events = requests.filter(e => e.timestampMs >= document!.committedAtMs && e.timestampMs < document!.committedAtMs + durationMs);
        return { durationMs, requestCount: events.length, requestSetSha256: gpcImpactRequestSetHash(events) };
      }) : [];
      if (!windows.length && !limits.length) limits.push("observation_window_too_short");
      const quiet = input.quietSnapshot?.();
      const quietCheckpoint = quiet && document && proof && !limits.length ? {
        contractVersion: "certscore.gpc-comparison-quiet.v1" as const,
        documentToken: document.token, signalReadbackAtMs: proof.capturedAtMs,
        quietForMs: Math.floor(Math.max(0, Math.min(proof.capturedAtMs - document.committedAtMs,
          quiet.quietForMs - (capturedAtMs - proof.capturedAtMs)))),
        inFlightRequestCount: quiet.inFlightRequestCount,
      } : undefined;
      frozen = gpcImpactCaptureSchema.parse({ contractVersion: "certscore.gpc-impact-capture.v1", scope: "page_http_request_attempts_after_document_commit",
        ...(quietCheckpoint ? {quietCheckpoint} : {}),
        expectedEnabled: input.expectedEnabled, captureStartedAtMs: startedAt, capturedAtMs, readbackDocumentToken, document, requestsDropped, windows, limitationKeys: limits, invalidationReasons: [...invalidationReasons] });
      return frozen;
    },
  };
}
