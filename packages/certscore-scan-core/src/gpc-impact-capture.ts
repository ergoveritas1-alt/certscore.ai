import { createHash } from "node:crypto";
import { GPC_IMPACT_HORIZONS_MS, GPC_DIAGNOSTIC_HORIZONS_MS, gpcImpactCaptureSchema, type GpcImpactCapture, type GpcSignalObservation, type NetworkEvent } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import type { LocalGpcAdaptiveParticipant, LocalGpcAdaptiveOutcome } from "./local-gpc-adaptive.js";

type RequestIdentity = Pick<NetworkEvent, "eventId" | "timestampMs" | "requestUrl">;
export function gpcImpactRequestSetHash(events: RequestIdentity[]) {
  return gpcImpactIdentityHash(events.map(e => ({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:gpcDocumentHash(e.requestUrl)})));
}
export function gpcImpactIdentityHash(events: Array<{eventId:string;timestampMs:number;urlSha256:string}>) {
  return createHash("sha256").update(JSON.stringify(events.map(e => [e.eventId, e.timestampMs, e.urlSha256])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

/** Uses the already-enabled metadata CDP session and existing request stream.
 * No browser calls, timers, polling, or waits are introduced. */
export function createGpcImpactCapture(input: { expectedEnabled: boolean; now: () => number; diagnostic15Seconds?: boolean; adaptive?: LocalGpcAdaptiveParticipant; quietSnapshot?: () => {quietForMs: number; inFlightRequestCount: number} }) {
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
    if (!frozen) { invalid = true; invalidationReasons.add(reason); input.adaptive?.fail(); }
  };
  let frozen: GpcImpactCapture | undefined;
  let readbackDocumentToken: string | null = null;
  let adaptiveOutcome: LocalGpcAdaptiveOutcome | undefined;
  let adaptiveFailed = false;
  return {
    async waitForAdaptive(signal?: AbortSignal) {
      if (!input.adaptive) return;
      try {adaptiveOutcome = await input.adaptive.wait(signal);}
      catch (error) {input.adaptive.fail();adaptiveFailed = true;if (signal?.aborted) throw error;}
    },
    remainingObservationMs(durationMs: 5000 | 15000) {
      return frozen || invalid || !document ? 0 : Math.max(0, document.committedAtMs + durationMs - input.now());
    },
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
      input.adaptive?.commit(document.token);
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
      if (document) input.adaptive?.request(event.timestampMs - document.committedAtMs);
    },
    finish(proof?: GpcSignalObservation): GpcImpactCapture {
      if (frozen) return frozen;
      const capturedAtMs = input.now();
      const limits: string[] = [];
      if (invalid || !document || !proof || proof.documentUrlSha256 !== document.urlSha256 ||
        readbackDocumentToken !== document.token || proof.capturedAtMs < document.committedAtMs ||
        proof.capturedAtMs > capturedAtMs || proof.expectedEnabled !== input.expectedEnabled) limits.push("document_or_readback_unverified");
      if (requestsDropped) limits.push("request_capture_overflow");
      if (input.adaptive && (!adaptiveOutcome || adaptiveFailed)) limits.push("adaptive_pair_unavailable");
      const horizons = input.diagnostic15Seconds ? GPC_DIAGNOSTIC_HORIZONS_MS : GPC_IMPACT_HORIZONS_MS;
      const adaptiveDuration = adaptiveOutcome?.durationMs;
      const measuredHorizons = adaptiveDuration ? [...new Set([...horizons.filter(ms => ms <= adaptiveDuration), adaptiveDuration])].sort((first,second)=>first-second) : horizons;
      const windows = !limits.length && document ? measuredHorizons.filter(ms => proof!.capturedAtMs >= document!.committedAtMs + ms).map(durationMs => {
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
        ...(input.adaptive ? {localRetention:"local_gpc_complete.v2"} : {}),
        ...(adaptiveOutcome && !limits.length ? {adaptiveObservation:{contractVersion:"certscore.local-gpc-adaptive.v1",minimumMs:5000,quietMs:2000,maximumMs:15000,...adaptiveOutcome}} : {}),
        ...(quietCheckpoint ? {quietCheckpoint} : {}),
        comparisonPolicy: "page_http_signal.v2", expectedEnabled: input.expectedEnabled, captureStartedAtMs: startedAt, capturedAtMs, readbackDocumentToken, document, requestsDropped, windows, limitationKeys: limits, invalidationReasons: [...invalidationReasons] });
      return frozen;
    },
  };
}
