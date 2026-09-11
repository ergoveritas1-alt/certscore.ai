import { verifiedGpcPreTransmissionBlock } from "./gpc-pre-transmission-block.js";
import type { Page, CDPSession, Request, Response } from "playwright";
import { gpcObservationSessionSchema, type GpcOptOutObservation, type GpcObservationSession, type NetworkEvent } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import { installGpcSemanticMonitor } from "./gpc-semantic-monitor.js";
import { createGpcRequestDiagnostics } from "./gpc-request-diagnostics.js";

/** Local opt-in. CDP binds actual navigation delivery to browser loader identity,
 * independently of wall-clock alignment between Node and performance.timeOrigin. */
export async function startGpcObservationSession(input: { page: Page; scanId: string; captureId: string; scanStartedAtMs: number }) {
  const { page } = input;
  const now = () => Math.max(0, Date.now() - input.scanStartedAtMs);
  const captureStartedAtMs = now();
  const monitorKey = `__certscore_gpc_${input.captureId.replaceAll("-", "")}`;
  await installGpcSemanticMonitor(page.context(), monitorKey);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await Promise.all([cdp.send("Network.enable"), cdp.send("Page.enable")]);
  const tree = await cdp.send("Page.getFrameTree");
  const mainFrameId = tree.frameTree.frame.id;
  const requestDiagnostics = createGpcRequestDiagnostics(cdp, mainFrameId);
  const documents: Array<{ loader: string; frame: string; requestId: string; requestAtMs: number; urlHash: string; secGpc: string | null }> = [];
  let committed: { loader: string; urlHash: string; at: number } | null = null;
  let documentDrops = 0, stopped = false, requestsObserved = 0, requestsDropped = 0;
  const requests: GpcObservationSession["requests"] = [];
  const requestHandles = new Map<string, Request>();
  const requestLoaders = new Map<string, string>();
  const responses = new Set<Request>();
  const onResponse = (response: Response) => {
    if (!stopped && responses.size < 5000) responses.add(response.request());
  };
  page.on("response", onResponse);
  const onRequest = (p: any) => {
    if (stopped || p.type !== "Document" || p.frameId !== mainFrameId || typeof p.loaderId !== "string" || !/^https?:/.test(p.request?.url ?? "")) return;
    if (documents.length >= 32) { documentDrops++; documents.shift(); }
    const header = Object.entries(p.request.headers ?? {}).find(([key]) => key.toLowerCase() === "sec-gpc")?.[1];
    documents.push({ loader: p.loaderId, frame: p.frameId, requestId: p.requestId, requestAtMs: now(),
      urlHash: gpcDocumentHash(p.request.url), secGpc: typeof header === "string" && header.length <= 8 ? header : null });
  };
  const onNavigated = (p: any) => {
    if (stopped || p.frame?.id !== mainFrameId || !p.frame.loaderId || !/^https?:/.test(p.frame.url ?? "")) return;
    committed = { loader: p.frame.loaderId, urlHash: gpcDocumentHash(p.frame.url), at: now() };
  };
  // A same-document URL change retains the loader; keep the actual request URL
  // separate so history.pushState cannot invent a request to the new URL.
  const onWithinDocument = (p: any) => {
    if (!stopped && committed && p.frameId === mainFrameId && /^https?:/.test(p.url ?? "")) committed.urlHash = gpcDocumentHash(p.url);
  };
  cdp.on("Network.requestWillBeSent", onRequest);
  cdp.on("Page.frameNavigated", onNavigated);
  cdp.on("Page.navigatedWithinDocument", onWithinDocument);
  return {
    monitorKey,
    recordRequest(event: Pick<NetworkEvent, "eventId" | "timestampMs" | "requestUrl" | "requestHeaders">,
      request?: Pick<Request, "allHeaders"> & Partial<Pick<Request, "timing" | "method" | "resourceType" | "serviceWorker" | "failure" | "frame">>) {
      if (stopped) return;
      requestsObserved++;
      if (requests.length >= 5000 || event.eventId.length > 160) { requestsDropped++; return; }
      const row: GpcObservationSession["requests"][number] = { eventId: event.eventId, timestampMs: event.timestampMs,
        urlSha256: gpcDocumentHash(event.requestUrl), secGpc: event.requestHeaders?.secGpc ?? null, headerSource: "request_snapshot" };
      requests.push(row);
      if (request) {
        requestHandles.set(event.eventId, request as Request);
        try { if (committed && request.frame?.() === page.mainFrame()) requestLoaders.set(event.eventId, committed.loader); } catch { /* No main-document owner. */ }
      }
      if (request && [request.timing, request.method, request.resourceType, request.serviceWorker, request.failure].every(fn => typeof fn === "function")) {
        let isMainFrame: boolean | null = null;
        try { if (request.frame) isMainFrame = request.frame() === page.mainFrame(); } catch { /* Worker-owned requests have no frame. */ }
        requestDiagnostics.track(event.eventId, request as Request, isMainFrame);
      }
      // Playwright's synchronous snapshot can omit security headers. Read only
      // missing values from the same request, overlapping the existing window.
      // Finalization never waits for these promises or borrows configured values.
      if (row.secGpc === null && request) {
        row.headerSource = "readback_pending";
        void request.allHeaders().then(headers => {
          if (stopped) return;
          const value = headers["sec-gpc"];
          row.secGpc = typeof value === "string" && value.length <= 8 ? value : null;
          row.headerSource = "all_headers_readback"; row.headerReadbackAtMs = now();
        }).catch(() => { if (!stopped) { row.headerSource = "readback_failed"; } });
      }
    },
    async finish(semanticObservation: GpcOptOutObservation | undefined, listener: { callbacks: number; dropped: number; registered: boolean } | undefined, aborted: boolean) {
      const limitations: string[] = [];
      const terminalTree = await cdp.send("Page.getFrameTree").catch(() => null);
      const final = terminalTree?.frameTree.frame;
      const commit = committed as { loader: string; urlHash: string; at: number } | null;
      const matching = commit ? documents.filter(d => d.loader === commit.loader && d.frame === mainFrameId) : [];
      // The last redirect hop within this exact browser loader delivered the
      // committed document. Multiple same-URL requests are not borrowed across loaders.
      const delivered = matching.at(-1);
      if (!commit || !delivered || final?.loaderId !== commit.loader || !final.url || gpcDocumentHash(final.url) !== commit.urlHash ||
        semanticObservation?.captureBinding?.documentToken !== commit.loader || semanticObservation.documentUrlSha256 !== commit.urlHash) limitations.push("terminal_document_unverified");
      if (documentDrops) limitations.push("document_capture_overflow");
      if (!listener) limitations.push("semantic_monitor_unavailable");
      if (listener?.dropped) limitations.push("semantic_monitor_overflow");
      if (requestsDropped) limitations.push("request_capture_overflow");
      // Playwright 1.58.2 forwards Chromium's blockedReason on this exact Request
      // when there is no network errorText. No URL/timing correlation is used.
      for (const row of requests) {
        const request = requestHandles.get(row.eventId);
        if (row.secGpc !== null || !request) continue;
        try {
          const reason = verifiedGpcPreTransmissionBlock({ failureText: request.failure()?.errorText, secGpc: row.secGpc,
            timing: request.timing(), responseReceived: responses.has(request), serviceWorker: request.serviceWorker() !== null,
            mainFrame: request.frame() === page.mainFrame(), requestLoader: requestLoaders.get(row.eventId), committedLoader: commit?.loader });
          if (reason && commit) {
            row.preTransmissionBlock = { reason, documentToken: commit.loader, secGpcHeaderRetained: false, source: "same_playwright_request_failure", observedAtMs: now(),
              responseReceived: false, networkTimingAvailable: false, serviceWorker: false };
          }
        } catch { /* Unknown failure timing is not proof of a pre-transmission block. */ }
      }
      if (requests.some(r => !r.preTransmissionBlock && (r.headerSource === "readback_pending" || r.headerSource === "readback_failed")))
        limitations.push("request_header_readback_incomplete");
      stopped = true;
      const packet = gpcObservationSessionSchema.parse({
        contractVersion: "certscore.gpc-observation-session.v2", scanId: input.scanId, captureId: input.captureId,
        observationScope: "main_document_and_retained_http_requests", captureStartedAtMs, captureEndedAtMs: now(),
        terminal: aborted ? "aborted" : limitations.length ? "incomplete" : "completed",
        mainDocument: limitations.includes("terminal_document_unverified") || !commit || !delivered ? null : {
          documentToken: commit.loader, documentUrlSha256: commit.urlHash, requestUrlSha256: delivered.urlHash,
          requestId: delivered.requestId, requestAtMs: delivered.requestAtMs, secGpc: delivered.secGpc, committedAtMs: commit.at,
        },
        semanticObservation: semanticObservation ?? null, requests, requestsObserved, requestsDropped,
        listener: listener ?? { callbacks: 0, dropped: 0, registered: false },
        requestDiagnostics: requestDiagnostics.finish(requests), limitationKeys: limitations,
      });
      return packet;
    },
    async close() { stopped = true; requestHandles.clear(); requestLoaders.clear(); responses.clear(); page.off("response", onResponse); requestDiagnostics.close(); await cdp.detach().catch(() => {}); },
  };
}
