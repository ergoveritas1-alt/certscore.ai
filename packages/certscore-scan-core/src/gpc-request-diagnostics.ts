import type { CDPSession, Request } from "playwright";
import { gpcRequestFailureCodeSchema, gpcRequestBlockedReasonSchema, type GpcObservationSession } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

type Diagnostics = NonNullable<GpcObservationSession["requestDiagnostics"]>;
type Candidate = { requestId: string; loaderId: string; isMainFrame: boolean; resourceType: string;
  requestStartEpochMs: number; requestEventEpochMs: number; monotonicTime: number; timingBasis: "request_event" | "response_timing";
  terminal: "unknown" | "response_received" | "finished" | "failed"; canceled: boolean; failureCode: ReturnType<typeof failureCode>;
  blockedReason: NonNullable<Diagnostics["missingHeaders"][number]["cdp"]>["blockedReason"];
  requestHeader: string | null; urlSha256: string; method: string };
type RequestHandle = Pick<Request, "timing" | "method" | "resourceType" | "serviceWorker" | "failure">;
const bounded = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
function failureCode(error: unknown) {
  if (!error) return "none" as const;
  const parsed = gpcRequestFailureCodeSchema.safeParse(typeof error === "string" && error.startsWith("net::") ? error.slice(5) : "other_network_error");
  return parsed.success ? parsed.data : "other_network_error" as const;
}
function header(headers: Record<string, unknown> | undefined): string | null {
  const matches = Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() === "sec-gpc");
  const value = matches.length === 1 ? matches[0]![1] : null;
  return typeof value === "string" && value.length <= 8 ? value : null;
}

/** Passive, bounded diagnostics. URL/method/timing correlation is explicitly an
 * aid, not an authoritative request identity and never substitutes header proof.
 * Redirect extra-info cannot be assigned to a hop merely by arrival order. */
export function createGpcRequestDiagnostics(cdp: CDPSession, mainFrameId: string) {
  const candidates: Candidate[] = [];
  const byId = new Map<string, Candidate[]>();
  const byUrlMethod = new Map<string, Candidate[]>();
  const extra = new Map<string, Array<string | null>>();
  const handles = new Map<string, { request: RequestHandle; isMainFrame: boolean | null }>();
  let observedCdpRequests = 0, droppedCdpEvents = 0, extraCount = 0, stopped = false;
  const onRequest = (p: any) => {
    if (stopped || !/^https?:/.test(p.request?.url ?? "")) return;
    observedCdpRequests++;
    if (candidates.length >= 5000 || typeof p.requestId !== "string" || p.requestId.length > 160 ||
      !Number.isFinite(p.wallTime) || p.wallTime < 0 || typeof p.request.method !== "string" || p.request.method.length > 32) { droppedCdpEvents++; return; }
    if (p.redirectResponse) updateResponse(p.requestId, p.redirectResponse);
    const candidate: Candidate = { requestId: p.requestId, loaderId: bounded(p.loaderId, 160), isMainFrame: p.frameId === mainFrameId,
      resourceType: bounded(p.type, 32), requestStartEpochMs: p.wallTime * 1000, requestEventEpochMs: p.wallTime * 1000,
      monotonicTime: p.timestamp, timingBasis: "request_event", terminal: "unknown", canceled: false, failureCode: "none", blockedReason: null,
      requestHeader: header(p.request.headers), urlSha256: gpcDocumentHash(p.request.url), method: p.request.method };
    candidates.push(candidate);
    const chain = byId.get(p.requestId) ?? []; chain.push(candidate); byId.set(p.requestId, chain);
    const key = `${candidate.urlSha256}:${candidate.method}`;
    const matching = byUrlMethod.get(key) ?? []; matching.push(candidate); byUrlMethod.set(key, matching);
  };
  const updateResponse = (requestId: string, response: any) => {
    const candidate = byId.get(requestId)?.at(-1);
    if (!candidate || stopped) return;
    candidate.terminal = "response_received";
    // Public Playwright timing uses ResourceTiming.requestTime, not necessarily
    // requestWillBeSent.wallTime. Convert the same CDP monotonic clock to epoch.
    const requestTime = response?.timing?.requestTime;
    if (Number.isFinite(requestTime) && Number.isFinite(candidate.monotonicTime)) {
      const epoch = candidate.requestEventEpochMs + (requestTime - candidate.monotonicTime) * 1000;
      if (epoch >= 0) { candidate.requestStartEpochMs = epoch; candidate.timingBasis = "response_timing"; }
    }
  };
  const onResponse = (p: any) => updateResponse(p.requestId, p.response);
  const onFinished = (p: any) => { const c = byId.get(p.requestId)?.at(-1); if (!stopped && c) c.terminal = "finished"; };
  const onFailed = (p: any) => { const c = byId.get(p.requestId)?.at(-1); if (!stopped && c) {
    c.terminal = "failed"; c.canceled = p.canceled === true; c.failureCode = p.errorText ? failureCode(p.errorText) : "unknown";
    const reason = gpcRequestBlockedReasonSchema.safeParse(p.blockedReason);
    c.blockedReason = p.blockedReason === undefined ? null : reason.success ? reason.data : "unknown";
  } };
  const onExtra = (p: any) => {
    if (stopped) return;
    if (extraCount++ >= 5000 || typeof p.requestId !== "string" || p.requestId.length > 160) { droppedCdpEvents++; return; }
    const entries = extra.get(p.requestId) ?? []; entries.push(header(p.headers)); extra.set(p.requestId, entries);
  };
  cdp.on("Network.requestWillBeSent", onRequest);
  cdp.on("Network.requestWillBeSentExtraInfo", onExtra);
  cdp.on("Network.responseReceived", onResponse);
  cdp.on("Network.loadingFinished", onFinished);
  cdp.on("Network.loadingFailed", onFailed);
  return {
    track(eventId: string, request: RequestHandle, isMainFrame: boolean | null) {
      if (!stopped && handles.size < 5000) handles.set(eventId, { request, isMainFrame });
    },
    finish(requests: GpcObservationSession["requests"]): Diagnostics {
      stopped = true;
      const describe = (candidate: Candidate): NonNullable<Diagnostics["missingHeaders"][number]["cdp"]> => {
        const chainCount = byId.get(candidate.requestId)!.length;
        const extraHeaders = extra.get(candidate.requestId) ?? [];
        return { requestId: candidate.requestId, loaderId: candidate.loaderId, isMainFrame: candidate.isMainFrame,
          resourceType: candidate.resourceType, requestStartEpochMs: candidate.requestStartEpochMs, timingBasis: candidate.timingBasis,
          requestHeader: candidate.requestHeader, terminal: candidate.terminal, canceled: candidate.canceled, failureCode: candidate.failureCode, blockedReason: candidate.blockedReason,
          extraInfoCount: extraHeaders.length, chainRequestCount: chainCount,
          extraInfoHeader: chainCount === 1 && extraHeaders.length === 1 ? extraHeaders[0]! : null,
          extraInfoStatus: chainCount !== 1 || extraHeaders.length > 1 ? "ambiguous_redirect_or_extra_info" : extraHeaders.length === 1 ? "single_request_single_extra_info" : "unavailable" };
      };
      const missing = requests.filter(r => r.secGpc !== "1");
      const missingHeaders: Diagnostics["missingHeaders"] = missing.slice(0, 256).map(row => {
        const handle = handles.get(row.eventId);
        let start: number | null = null, method = "", resourceType = "", serviceWorker: boolean | null = null;
        let failure: Diagnostics["missingHeaders"][number]["failure"] = "unknown";
        let code: ReturnType<typeof failureCode> = "unknown";
        try {
          if (handle) {
            const value = handle.request.timing().startTime;
            start = Number.isFinite(value) && value > 0 ? value : null;
            method = bounded(handle.request.method(), 32); resourceType = bounded(handle.request.resourceType(), 32);
            serviceWorker = handle.request.serviceWorker() !== null;
            const error = handle.request.failure()?.errorText;
            failure = !error ? "none" : error === "net::ERR_ABORTED" ? "aborted" : "network_error";
            code = failureCode(error);
          }
        } catch { /* Unsupported browser handles remain explicit, uncorrelated diagnostics. */ }
        const possible = byUrlMethod.get(`${row.urlSha256}:${method}`) ?? [];
        const matches = start === null ? [] : possible.filter(c => Math.abs(c.requestStartEpochMs - start!) <= 1);
        const candidate = matches.length === 1 ? matches[0]! : undefined;
        return { eventId: row.eventId, urlSha256: row.urlSha256, method, resourceType, isMainFrame: handle?.isMainFrame ?? null,
          serviceWorker, requestStartEpochMs: start, failure, failureCode: code, candidateCount: matches.length,
          correlation: start === null ? "timing_unavailable" : matches.length === 1 ? "unique_url_method_start_time" : matches.length ? "ambiguous" : "unmatched",
          cdp: candidate ? describe(candidate) : null,
          urlMethodCandidateCount: possible.length, unboundCandidates: candidate ? [] : possible.slice(0, 3).map(describe) };
      });
      return { contractVersion: "certscore.gpc-request-diagnostics.v1", observedCdpRequests, droppedCdpEvents,
        droppedDiagnostics: Math.max(0, missing.length - 256), missingHeaders };
    },
    close() { stopped = true; cdp.off("Network.requestWillBeSent", onRequest); cdp.off("Network.requestWillBeSentExtraInfo", onExtra);
      cdp.off("Network.responseReceived", onResponse); cdp.off("Network.loadingFinished", onFinished); cdp.off("Network.loadingFailed", onFailed); handles.clear(); },
  };
}
