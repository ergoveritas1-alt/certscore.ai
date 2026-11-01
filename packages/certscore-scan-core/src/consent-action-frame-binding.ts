import type {ElementHandle, Frame, Page} from "playwright";

/** Native frame events invalidate the selected document even when its URL is
 * unchanged. Fragment-only changes get one bounded document-identity read;
 * ordinary paths add no browser command. No polling, DOM writes or replacement
 * binding after invalidation. Input and semantic readback share the guard. */
export function createConsentActionFrameBinding() {
  const controller = new AbortController();
  let page: Page | undefined, selected: Frame | undefined;
  let element: ElementHandle<HTMLElement | SVGElement> | undefined, selectedUrl = "";
  let pending: Promise<boolean> | undefined, revision = 0, identityReads = 0, resultDeadlineAtMs = Infinity;
  const abort = () => controller.abort(new Error("consent_action_source_document_changed"));
  const invalidate = (frame: Frame) => {
    if (frame !== selected) return;
    let before: URL, after: URL;
    try {before = new URL(selectedUrl);after = new URL(frame.url());}
    catch {abort();return;}
    const changed = before.href !== after.href;
    before.hash = "";after.hash = "";selectedUrl = frame.url();
    const currentRevision = ++revision;
    if (!changed || before.href !== after.href || !element || pending || identityReads++ >= 1) {abort();return;}
    // A detached clicked button may still belong to this same document. Read
    // from the current frame realm, passing the exact proof-bound node; a new
    // document cannot adopt its old identity just by retaining the same URL.
    let timer: NodeJS.Timeout | undefined;
    const actual = frame.evaluate(node => node.ownerDocument === document, element).catch(() => false);
    const work = Promise.race([actual, new Promise<false>(resolve => {
      timer = setTimeout(() => resolve(false), Math.max(0, Math.min(100, resultDeadlineAtMs - Date.now())));
      timer.unref?.();
    })]).then(valid => {
      if (revision === currentRevision && !valid) abort();
      return valid && !controller.signal.aborted;
    }).finally(() => {if (timer) clearTimeout(timer);if (pending === work) pending = undefined;});
    pending = work;
  };
  const detach = (frame: Frame) => {if (frame === selected) {revision++;abort();}};
  const ready = async (deadlineAtMs: number) => {
    if (controller.signal.aborted) return false;
    const check = pending;
    if (!check) return true;
    if (Date.now() >= deadlineAtMs) return false;
    let timer: NodeJS.Timeout | undefined;
    try {return await Promise.race([check, new Promise<false>(resolve => {
      timer = setTimeout(() => resolve(false), Math.max(0, deadlineAtMs - Date.now()));
    })]) && !controller.signal.aborted;}
    finally {if (timer) clearTimeout(timer);}
  };
  const dispose = () => {
    page?.off("framenavigated", invalidate);
    page?.off("framedetached", detach);
    page = undefined;selected = undefined;
  };
  return {
    signal: controller.signal,
    get current() {return !controller.signal.aborted && !pending;},
    assertCurrent() {if (controller.signal.aborted || pending) throw new Error("consent_action_source_document_unverified");},
    setElement(value: ElementHandle<HTMLElement | SVGElement> | undefined, deadlineAtMs?: number) {
      element = value;resultDeadlineAtMs = deadlineAtMs ?? Infinity;
    },
    async read<T>(timeoutMs: number, operation: (remainingMs: number) => Promise<T>): Promise<T | undefined> {
      const deadlineAtMs = Date.now() + Math.max(0, timeoutMs);
      if (!await ready(deadlineAtMs)) return undefined;
      const result = await operation(Math.max(0, deadlineAtMs - Date.now()));
      return await ready(deadlineAtMs) ? result : undefined;
    },
    bind(owner: Page, scope: Page | Frame) {
      if (controller.signal.aborted) return;
      if (owner !== page) {
        dispose();page = owner;
        owner.on("framenavigated", invalidate);
        owner.on("framedetached", detach);
      }
      selected = "mainFrame" in scope ? scope.mainFrame() : scope;
      selectedUrl = selected.url();
    },
    dispose,
  };
}
