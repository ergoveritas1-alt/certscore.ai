import { createHash, randomUUID } from "node:crypto";
import { ONETRUST_REVIEWED_SDKS, type ConsentConfirmationReason, type OneTrustSdkSource } from "@certscore/contracts";
import type { Page, Frame, Request, Response } from "playwright";

type Capture = { snapshot(): OneTrustSdkSource | undefined; diagnostic(): ConsentConfirmationReason | undefined; dispose(): void };
const captures = new WeakMap<Page, Capture>();
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function documentUrl(page: Page) { try { const u = new URL(page.url()); if (u.protocol !== "https:") return ""; u.hash = ""; return u.href; } catch { return ""; } }

/** Hash only a response already received by this action page. Never await this
 * optional work from a confirmation or cleanup path. A late hash proves nothing
 * about an earlier baseline. No request, SDK call, polling or tail wait. */
export function installOneTrustSdkSourceCapture(page: Page): Capture {
  const capture = createOneTrustSdkSourceCapture(page, sha);
  return capture;
}

/** Internal factory permits deterministic byte-digest/lifecycle fixtures. The
 * production installer always uses SHA-256 and the reviewed source registry. */
export function createOneTrustSdkSourceCapture(page: Page, digest: (bytes: Buffer) => string): Capture {
  let epoch = randomUUID(), disposed = false, attempted = false, requestCount = 0, source: OneTrustSdkSource | undefined;
  let reason: ConsentConfirmationReason | undefined = "sdk_not_observed";
  const requests = new WeakMap<Request, string>();
  const navigate = (frame: Frame) => {
    if (frame !== page.mainFrame()) return;
    epoch = randomUUID(); attempted = false; requestCount = 0; source = undefined; reason = "sdk_document_changed";
  };
  const request = (req: Request) => {
    try {
      if (/\/otBannerSdk\.js$/i.test(new URL(req.url()).pathname) && req.resourceType() === "script" &&
        req.frame() === page.mainFrame() && Boolean(documentUrl(page))) {
        requestCount = Math.min(2, requestCount + 1);
        source = undefined;
        reason = requestCount > 1 ? "sdk_multiple_requests" : ONETRUST_REVIEWED_SDKS.some(pin => req.url() === pin.sdkUrl) ? "sdk_response_unverified" : "sdk_unreviewed";
        if (requestCount === 1 && ONETRUST_REVIEWED_SDKS.some(pin => req.url() === pin.sdkUrl) && req.method() === "GET" && !req.redirectedFrom()) requests.set(req, epoch);
      }
    } catch { /* A detached/worker request supplies no same-document proof. */ }
  };
  const response = (res: Response) => {
    try {
      const req = res.request(), requestEpoch = requests.get(req);
      const pin = ONETRUST_REVIEWED_SDKS.find(pin => pin.sdkUrl === req.url());
      const capturedDocument = documentUrl(page);
      if (!pin || !capturedDocument || disposed || attempted || requestCount !== 1 || requestEpoch !== epoch || !requestEpoch ||
        res.status() !== 200 || res.fromServiceWorker() || res.url() !== pin.sdkUrl || req.redirectedFrom()) return;
      attempted = true;
      reason = "sdk_body_unavailable";
      // Reject oversized declared transfers before requesting the received body.
      const length = res.headers()["content-length"];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > 2 * 1024 * 1024)) return;
      reason = "sdk_body_pending";
      void res.body().then(bytes => {
        if (disposed || requestCount !== 1 || requestEpoch !== epoch || documentUrl(page) !== capturedDocument) return;
        if (bytes.length !== pin.sdkBytes || digest(bytes) !== pin.sdkSha256) { reason = "sdk_body_mismatch"; return; }
        reason = undefined;
        source = {sdkUrl:pin.sdkUrl,sdkSha256:pin.sdkSha256,sdkBytes:pin.sdkBytes,
          documentSha256:sha(capturedDocument),documentEpochSha256:sha(epoch),observedAtEpochMs:Date.now(),
          responseStatus:200,redirected:false,serviceWorker:false};
      }).catch(() => { if (!disposed && requestEpoch === epoch && requestCount === 1) reason = "sdk_body_unavailable"; });
    } catch { /* Optional source proof must never interrupt the action lane. */ }
  };
  page.on("framenavigated", navigate); page.on("request", request); page.on("response", response);
  const capture: Capture = {
    diagnostic: () => reason,
    snapshot: () => !disposed && source?.documentSha256 === sha(documentUrl(page)) ? source : undefined,
    dispose: () => {
      disposed = true; source = undefined;
      page.off("framenavigated", navigate); page.off("request", request); page.off("response", response);
      if (captures.get(page) === capture) captures.delete(page);
    },
  };
  captures.set(page, capture);
  return capture;
}

export function readOneTrustSdkSource(scope: Page | Frame) {
  const page = "page" in scope ? scope.page() : scope;
  if ("page" in scope && scope !== page.mainFrame()) return undefined;
  return captures.get(page)?.snapshot();
}

export function readOneTrustSdkSourceDiagnostic(scope: Page | Frame): ConsentConfirmationReason | undefined {
  const page = "page" in scope ? scope.page() : scope;
  if ("page" in scope && scope !== page.mainFrame()) return "sdk_capture_unavailable";
  return captures.get(page)?.diagnostic() ?? (captures.get(page)?.snapshot() ? undefined : "sdk_capture_unavailable");
}
