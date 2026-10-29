import type { Page, Request } from "playwright";
import { isRegisteredCmpInitializationRequest } from "./cmp-initialization-settle";

const MAX_RUNTIME_URLS = 512;
const MAX_RUNTIME_URL_LENGTH = 4_096;
const DOM_WAKE_DEBOUNCE_MS = 25;
let bindingSequence = 0;

export type ConsentActionDiscovery = {
  readonly revision: number;
  dispose(): void;
  runtimeUrls(): string[];
  waitForSignal(afterRevision: number, timeoutMs: number, signal?: AbortSignal): Promise<void>;
};

/**
 * Installs bounded, observation-only discovery before navigation. Network and
 * DOM activity wake the canonical resolver without retaining DOM content or
 * authorizing an interaction. Recipes/classifiers still decide which control,
 * if any, may be clicked.
 */
export async function installConsentActionDiscovery(
  page: Page,
): Promise<ConsentActionDiscovery> {
  const runtimeUrls = new Set<string>();
  const waiters = new Set<() => void>();
  const bindingName = `__certscoreConsentActionWake${++bindingSequence}`;
  let revision = 0;
  let disposed = false;

  const notify = () => {
    if (disposed) return;
    revision += 1;
    for (const resolve of [...waiters]) resolve();
  };
  const rememberRuntimeUrl = (value: string) => {
    if (disposed || !value || value.length > MAX_RUNTIME_URL_LENGTH || runtimeUrls.has(value)) return;
    if (runtimeUrls.size >= MAX_RUNTIME_URLS) {
      const oldest = runtimeUrls.values().next().value;
      if (typeof oldest === "string") runtimeUrls.delete(oldest);
    }
    runtimeUrls.add(value);
    notify();
  };
  const onRequest = (request: Request) => rememberRuntimeUrl(request.url());
  const onFrameActivity = () => notify();
  const onRuntimeCompleted = (request:Request) => {
    try {
      const type=request.resourceType();
      if(type!=="script" && type!=="xhr" && type!=="fetch")return;
      if(isRegisteredCmpInitializationRequest({method:request.method(),requestUrl:request.url(),
        resourceType:type,isMainFrame:request.frame()===page.mainFrame()}))notify();
    } catch { /* Detached/worker requests cannot establish a document hint. */ }
  };
  page.on("request", onRequest);
  page.on("requestfinished", onRuntimeCompleted);
  page.on("requestfailed", onRuntimeCompleted);
  page.on("frameattached", onFrameActivity);
  page.on("framenavigated", onFrameActivity);

  await page.exposeBinding(bindingName, () => notify());
  await page.addInitScript(({ bindingName, debounceMs }) => {
    // Object methods stay self-contained when serialized by both tsc and tsx;
    // named local arrow helpers can acquire an unavailable bundler __name call.
    const hooks = { wake() {
      const stateKey = `__certscoreConsentWakePending:${bindingName}`;
      const scope = globalThis as typeof globalThis & Record<string, unknown>;
      if (scope[stateKey]) return;
      scope[stateKey] = true;
      setTimeout(() => {
        scope[stateKey] = false;
        const binding = scope[bindingName];
        if (typeof binding === "function") {
          void Promise.resolve((binding as () => unknown)()).catch(() => undefined);
        }
      }, debounceMs);
    },
    install() {
      if (!document.documentElement) return;
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) =>
          mutation.type === "attributes" || mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0
        )) hooks.wake();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          "aria-disabled",
          "aria-hidden",
          "aria-label",
          "class",
          "disabled",
          "hidden",
          "role",
          "style",
        ],
        childList: true,
        subtree: true,
      });
      const resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(hooks.wake)
        : undefined;
      resizeObserver?.observe(document.documentElement);
      if (document.body) resizeObserver?.observe(document.body);
      // CSS animations and page scrolling can move an otherwise unchanged
      // consent control into or out of the viewport without mutating the DOM.
      // These events only wake the bounded canonical resolver; they do not
      // retain page text or extend its deadline.
      addEventListener("resize", hooks.wake, { passive: true });
      addEventListener("scroll", hooks.wake, { capture: true, passive: true });
      addEventListener("animationend", hooks.wake, { capture: true, passive: true });
      addEventListener("transitionend", hooks.wake, { capture: true, passive: true });
      hooks.wake();
    }};
    // Initialization/update events only wake the resolver; payloads never
    // become a registered choice or bypass fresh semantic receipt verification.
    addEventListener("OneTrustGroupsUpdated", hooks.wake, {passive:true});
    addEventListener("OTConsentApplied", hooks.wake, {passive:true});
    if (document.documentElement) hooks.install();
    else {
      // Observe the first root instead of waiting for a parser-blocked DCL.
      const rootObserver=new MutationObserver(()=>{
        if(document.documentElement){rootObserver.disconnect();hooks.install();}
      });
      rootObserver.observe(document,{childList:true});
    }
  }, { bindingName, debounceMs: DOM_WAKE_DEBOUNCE_MS });

  return {
    get revision() {
      return revision;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      page.off("request", onRequest);
      page.off("requestfinished", onRuntimeCompleted);
      page.off("requestfailed", onRuntimeCompleted);
      page.off("frameattached", onFrameActivity);
      page.off("framenavigated", onFrameActivity);
      for (const resolve of [...waiters]) resolve();
      waiters.clear();
    },
    runtimeUrls: () => [...runtimeUrls],
    async waitForSignal(afterRevision, timeoutMs, signal) {
      if (disposed || revision !== afterRevision || timeoutMs <= 0 || signal?.aborted) return;
      await new Promise<void>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          waiters.delete(done);
          signal?.removeEventListener("abort", done);
          resolve();
        };
        waiters.add(done);
        signal?.addEventListener("abort", done, { once: true });
        timer = setTimeout(done, timeoutMs);
        // Keep the bounded wake timer referenced. Playwright transports may
        // not keep Node's event loop active while the resolver is awaiting a
        // quiet page, and an unref'd timer can otherwise resume only when an
        // unrelated 30-second timeout fires.
        if (disposed || revision !== afterRevision || signal?.aborted) done();
      });
    },
  };
}
