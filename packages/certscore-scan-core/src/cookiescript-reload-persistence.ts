import type { BrowserContext, Frame, Page, Request } from "playwright";
import { readWithinActionBoundary } from "./action-operation-boundary.js";

const cookieName = "CookieScriptConsent";
const maxReloadReadMs = 650;

/** Diagnostic storage evidence for a single natural, unredirected navigation.
 * The selected element's document guard still owns click and registration evidence. */
export function observeCookieScriptReload(
  page: Page,
  context: BrowserContext,
  exactTargetUrl: string,
  authorizedTargetSha256: string,
  scanStartedAtMs: number,
  actionDispatchedAtMs: number,
  deadlineAtMs: number,
  signal?: AbortSignal,
) {
  if (page.url() !== exactTargetUrl) return undefined;
  const mainFrame = page.mainFrame();
  let reload: Request | undefined;
  let reloadCommittedAtMs: number | undefined;
  let invalidated = false;
  let evidence: Awaited<ReturnType<typeof readPersistence>>;
  let reading = false;
  let notify: () => void;
  const ready = new Promise<void>(resolve => { notify = resolve; });

  const invalidate = () => {
    invalidated = true;
    notify();
  };
  const onRequest = (request: Request) => {
    if (!request.isNavigationRequest() || request.serviceWorker()) return;
    // A navigation may temporarily have no frame while the browser creates
    // it. It cannot be used as proof of a reload in the original main frame.
    let frame: Frame;
    try { frame = request.frame(); } catch { return; }
    if (frame !== mainFrame) return;
    if (reload || request.redirectedFrom() || request.method() !== "GET" || request.url() !== exactTargetUrl) {
      invalidate();
      return;
    }
    reload = request;
  };
  const onNavigation = (frame: Frame) => {
    if (frame !== mainFrame) return;
    if (!reload || reloadCommittedAtMs !== undefined || frame.url() !== exactTargetUrl) {
      invalidate();
      return;
    }
    reloadCommittedAtMs = Date.now() - scanStartedAtMs;
  };
  async function readPersistence(request: Request, committedAtMs: number) {
    const [response, header, cookies] = await Promise.all([
      request.response(), request.headerValue("cookie"), context.cookies(exactTargetUrl),
    ]);
    if (invalidated || page.url() !== exactTargetUrl || !response ||
        (!response.ok() && response.status() !== 304) || request.redirectedTo()) return undefined;
    const prefix = cookieName + "=";
    const sent = header?.split(";").map(field => field.trim()).filter(field => field.startsWith(prefix));
    const retained = cookies.filter(cookie => cookie.name === cookieName);
    if (sent?.length !== 1 || retained.length !== 1 || !retained[0]?.value ||
        sent[0] !== prefix + retained[0].value) return undefined;
    return {
      version: "cookiescript_reload_persistence.v1",
      cookieName,
      authorizedTargetSha256,
      actionDispatchedAtMs,
      reloadCommittedAtMs: committedAtMs,
      observedAtMs: Date.now() - scanStartedAtMs,
    } as const;
  }
  const onLoaded = () => {
    const request = reload;
    const committedAtMs = reloadCommittedAtMs;
    if (!request || committedAtMs === undefined || invalidated || reading) return;
    reading = true;
    void readWithinActionBoundary(() => readPersistence(request, committedAtMs), undefined,
      Math.min(deadlineAtMs, Date.now() + maxReloadReadMs), signal).then(result => {
        evidence = result;
      }).catch(() => undefined).finally(notify);
  };
  const onFailure = (request: Request) => {
    if (request === reload) invalidate();
  };

  page.on("request", onRequest);
  page.on("framenavigated", onNavigation);
  page.on("domcontentloaded", onLoaded);
  page.on("requestfailed", onFailure);
  page.on("close", invalidate);

  const dispose = () => {
    page.off("request", onRequest);
    page.off("framenavigated", onNavigation);
    page.off("domcontentloaded", onLoaded);
    page.off("requestfailed", onFailure);
    page.off("close", invalidate);
    invalidate();
  };

  return {
    dispose,
    async finish() {
      try {
        if (!reload || invalidated || signal?.aborted) return undefined;
        if (!evidence) {
          await readWithinActionBoundary(() => ready, undefined,
            Math.min(deadlineAtMs, Date.now() + maxReloadReadMs), signal);
        }
        return !invalidated && !signal?.aborted ? evidence : undefined;
      } finally {
        dispose();
      }
    },
  };
}
