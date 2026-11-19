import { createHash } from "node:crypto";
import type { BrowserContext, Frame, Page, Request } from "playwright";
import { TRUSTARC_REJECT_COOKIE_DOMAINS, usesTrustArcUnderscoreReceipt, type TrustArcRejectReceipt } from "./trustarc-reject-receipt.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const endingWindowMs = 8_000;

export function observeTrustArcReload(page: Page, context: BrowserContext) {
  let receipt: TrustArcRejectReceipt | undefined;
  let firstCommitAt: number | undefined;
  let requestAt: number | undefined;
  let invalid = false;
  let revision = 0;
  const onRequest = (request: Request) => {
    if (!receipt) return;
    try {
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
      if (requestAt !== undefined || request.method() !== "GET" ||
          request.url() !== receipt.documentUrl || request.redirectedFrom()) invalid = true;
      else requestAt = Date.now();
    } catch { invalid = true; }
  };
  const onCommit = (frame: Frame) => {
    if (!receipt || frame !== page.mainFrame()) return;
    revision++;
    if (frame.url() !== receipt.documentUrl || requestAt === undefined) invalid = true;
    else firstCommitAt ??= Date.now();
  };
  page.on("request", onRequest);
  page.on("framenavigated", onCommit);
  return {
    // Set during the original document's verified confirmation read.
    arm(value: TrustArcRejectReceipt) { if (!receipt) receipt = value; },
    get reloaded() { return firstCommitAt !== undefined; },
    stillBound() {
      return !invalid && receipt !== undefined && firstCommitAt !== undefined &&
        !page.isClosed() && page.url() === receipt.documentUrl;
    },
    async read(relative: (time: number) => number) {
      const started = Date.now();
      if (!receipt || !this.stillBound() || requestAt === undefined || firstCommitAt === undefined ||
          started >= receipt.dispatchAtEpochMs + endingWindowMs) return;
      const { documentUrl, dispatchAtEpochMs, readAtEpochMs, stateHash, writes } = receipt;
      const domain = TRUSTARC_REJECT_COOKIE_DOMAINS.get(documentUrl);
      if (!domain || !usesTrustArcUnderscoreReceipt(documentUrl)) return;
      const beforeRead = revision;
      const [cookies, document] = await Promise.all([
        context.cookies(documentUrl),
        page.evaluate(() => ({
          url: location.href, timeOrigin: performance.timeOrigin, top: window === window.top,
          navigationType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
        })),
      ]);
      if (Date.now() > dispatchAtEpochMs + endingWindowMs || revision !== beforeRead || !this.stillBound() ||
          document.url !== documentUrl || !document.top || document.navigationType !== "reload" ||
          !Number.isFinite(document.timeOrigin) || document.timeOrigin <= readAtEpochMs ||
          document.timeOrigin < requestAt - 100 || document.timeOrigin > firstCommitAt + 100 ||
          document.timeOrigin > started) return;
      if (writes.length !== 3 || !writes.every(write => {
        const matching = cookies.filter(cookie => cookie.name === write.name);
        const cookie = matching[0];
        return matching.length === 1 && cookie?.domain.replace(/^\./, "") === domain &&
          cookie.path === "/" && !cookie.partitionKey && sha256(cookie.value) === write.valueSha256 &&
          sha256(JSON.stringify(["cookie_name_domain_path_partition", domain, "/", "", cookie.name])) === write.identitySha256;
      })) return;
      return {
        stateHash,
        trustArcReloadReadback: {
          preReloadReadAtMs: relative(readAtEpochMs), reloadCommittedAtMs: relative(firstCommitAt),
        },
      };
    },
    dispose() {
      page.off("request", onRequest);
      page.off("framenavigated", onCommit);
    },
  };
}
