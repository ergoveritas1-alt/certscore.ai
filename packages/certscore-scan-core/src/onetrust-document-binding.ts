import type { CDPSession, Frame, Page } from "playwright";

export const ONETRUST_DOCUMENT_CHECKPOINT_LIMIT = 2;
export const ONETRUST_DOCUMENT_CHECKPOINT_MS = 100;
const EVENT_QUEUE_LIMIT = 8;

export type OneTrustNativeDocument = { frameId: string; loaderId: string; url: string };
export type OneTrustNativeBindingOptions = { deadlineAtEpochMs?: number; signal?: AbortSignal };
export type OneTrustDocumentCheckpoint = { navigationType: "historyApi" | "documentCommit"; original: OneTrustNativeDocument; readback: OneTrustNativeDocument;
  startedAtEpochMs: number; verifiedAtEpochMs: number };
type SourceBinding = { epoch: string; document: OneTrustNativeDocument };
type NativeEvent = { kind: "commit" | "history"; url: string; document?: OneTrustNativeDocument };

function nativeDocument(frame: any): OneTrustNativeDocument | undefined {
  if (!frame || frame.parentId || typeof frame.id !== "string" || !frame.id || frame.id.length > 160 ||
    typeof frame.loaderId !== "string" || !frame.loaderId || frame.loaderId.length > 160 || typeof frame.url !== "string") return;
  const url = frame.url + (typeof frame.urlFragment === "string" ? frame.urlFragment : "");
  if (!url.startsWith("https://") || url.length > 8192) return;
  return { frameId: frame.id, loaderId: frame.loaderId, url };
}
function sameDocument(a: OneTrustNativeDocument, b: OneTrustNativeDocument) {
  return a.frameId === b.frameId && a.loaderId === b.loaderId && a.url === b.url;
}

/** Optional native witness for one narrow restoration. Ordinary source capture
 * keeps its conservative Playwright lifecycle when native setup is unavailable.
 * Event order/URL pairing only selects a checkpoint; it never authorizes restore.
 */
export function createOneTrustDocumentBinding(input: {
  page: Page;
  source(): SourceBinding | undefined;
  suspend(): void;
  invalidate(): void;
  commitPaired(): boolean;
  restore(epoch: string, checkpoint: OneTrustDocumentCheckpoint): void;
}) {
  const { page } = input;
  let session: CDPSession | undefined;
  let options: OneTrustNativeBindingOptions = {};
  let enabled = false, unavailable = false, disposed = false, documentPoisoned = false;
  let committed: OneTrustNativeDocument | undefined;
  let pairedCommit: OneTrustNativeDocument | undefined;
  let generation = 0, checkpoints = 0, inFlight = false;
  let candidate: SourceBinding | undefined;
  let checkpointNeeded = false;
  let checkpointKind: "historyApi" | "documentCommit" = "historyApi";
  let setupTimer: ReturnType<typeof setTimeout> | undefined;
  let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  const nativeEvents: NativeEvent[] = [];
  const playwrightEvents: string[] = [];
  const listeners: Array<{ method: string; listener: (...args: any[]) => void }> = [];

  const active = () => !disposed && !unavailable && !options.signal?.aborted &&
    (options.deadlineAtEpochMs === undefined || Date.now() < options.deadlineAtEpochMs);
  const remainingMs = () => Math.max(0, Math.min(ONETRUST_DOCUMENT_CHECKPOINT_MS,
    options.deadlineAtEpochMs === undefined ? ONETRUST_DOCUMENT_CHECKPOINT_MS : options.deadlineAtEpochMs - Date.now()));
  const hardInvalidate = () => {
    generation++;
    candidate = undefined;
    checkpointNeeded = false;
    input.invalidate();
  };
  const disable = () => {
    if (disposed) return;
    unavailable = true;
    if (setupTimer) clearTimeout(setupTimer);
    if (checkpointTimer) clearTimeout(checkpointTimer);
    setupTimer = undefined;
    checkpointTimer = undefined;
    nativeEvents.length = 0;
    playwrightEvents.length = 0;
    hardInvalidate();
  };
  const poisonDocument = () => {
    documentPoisoned = true;
    hardInvalidate();
  };
  const suspend = () => {
    generation++;
    const current = input.source();
    if (!candidate && current) candidate = current;
    input.suspend();
  };
  const candidateStillCurrent = (saved: SourceBinding) => {
    const current = input.source();
    return !!current && current.epoch === saved.epoch && sameDocument(current.document, saved.document);
  };
  const checkpoint = () => {
    if (!checkpointNeeded || inFlight || !active() || !enabled || documentPoisoned ||
      !candidate || !committed || !pairedCommit || nativeEvents.length || playwrightEvents.length) return;
    if (!sameDocument(candidate.document, committed) || !sameDocument(pairedCommit, committed) ||
      page.url() !== committed.url || !candidateStillCurrent(candidate)) { poisonDocument(); return; }
    if (checkpoints >= ONETRUST_DOCUMENT_CHECKPOINT_LIMIT || remainingMs() <= 0) { disable(); return; }
    const saved = candidate;
    const checkpointGeneration = generation;
    const savedKind = checkpointKind;
    const startedAtEpochMs = Date.now();
    const checkpointBudgetMs = remainingMs();
    checkpoints++;
    inFlight = true;
    checkpointNeeded = false;
    // No caller awaits this work. Timeout permanently disables restoration so
    // a still-pending native command never overlaps another checkpoint.
    checkpointTimer = setTimeout(disable, checkpointBudgetMs);
    checkpointTimer.unref?.();
    let read: ReturnType<CDPSession["send"]>;
    try { read = session!.send("Page.getFrameTree"); }
    catch {
      if (checkpointTimer) clearTimeout(checkpointTimer);
      checkpointTimer = undefined;
      inFlight = false;
      disable();
      return;
    }
    void read.then((tree: any) => {
      if (!active() || generation !== checkpointGeneration || documentPoisoned ||
        nativeEvents.length || playwrightEvents.length || !candidateStillCurrent(saved)) return;
      const verifiedAtEpochMs = Date.now();
      if (verifiedAtEpochMs < startedAtEpochMs || verifiedAtEpochMs - startedAtEpochMs > checkpointBudgetMs ||
        (options.deadlineAtEpochMs !== undefined && verifiedAtEpochMs >= options.deadlineAtEpochMs)) { disable(); return; }
      const readback = nativeDocument(tree.frameTree?.frame);
      if (!readback || !committed || !sameDocument(readback, saved.document) ||
        !sameDocument(committed, saved.document) || page.url() !== saved.document.url) { poisonDocument(); return; }
      // Restore only now. Neither the earlier event nor a future result can
      // retroactively lend proof to a baseline read that already ran.
      candidate = undefined;
      input.restore(saved.epoch, { navigationType: savedKind, original: saved.document, readback, startedAtEpochMs, verifiedAtEpochMs });
    }).catch(disable).finally(() => {
      if (checkpointTimer) clearTimeout(checkpointTimer);
      checkpointTimer = undefined;
      inFlight = false;
      checkpoint();
    });
  };
  const pair = () => {
    if (nativeEvents.length > EVENT_QUEUE_LIMIT || playwrightEvents.length > EVENT_QUEUE_LIMIT) { disable(); return; }
    while (nativeEvents.length && playwrightEvents.length) {
      const native = nativeEvents.shift()!;
      const url = playwrightEvents.shift()!;
      if (native.url !== url) { disable(); return; }
      if (native.kind === "commit") {
        if (!committed || !native.document || !sameDocument(committed, native.document)) { disable(); return; }
        pairedCommit = native.document;
        // onCommit already invalidated the old epoch. SDK bytes observed in
        // between the two notifications need a loader readback, not another reset.
        candidate = undefined;
        checkpointNeeded = input.commitPaired();
        checkpointKind = "documentCommit";
        if (checkpointNeeded) candidate = input.source();
      } else {
        if (!pairedCommit || !committed || !sameDocument(pairedCommit, committed) ||
          documentPoisoned || url !== committed.url) { poisonDocument(); return; }
        checkpointNeeded = true;
        checkpointKind = "historyApi";
      }
    }
    checkpoint();
  };
  const onCommit = (event: any) => {
    if (event?.frame?.parentId) return;
    if (!active()) { if (!disposed && !unavailable) disable(); return; }
    const next = nativeDocument(event?.frame);
    hardInvalidate();
    if (!next) { disable(); return; }
    if (committed && next.frameId !== committed.frameId) { disable(); return; }
    committed = next;
    pairedCommit = undefined;
    documentPoisoned = false;
    nativeEvents.push({ kind: "commit", url: next.url, document: next });
    pair();
  };
  const onWithinDocument = (event: any) => {
    if (!active()) { if (!disposed && !unavailable) disable(); return; }
    if (!committed || event?.frameId !== committed.frameId) return;
    suspend();
    if (event.navigationType !== "historyApi" || event.url !== committed.url) { poisonDocument(); return; }
    nativeEvents.push({ kind: "history", url: event.url });
    pair();
  };
  const onDocumentOpened = (event: any) => {
    if (!active()) { if (!disposed && !unavailable) disable(); return; }
    if (!committed || event?.frame?.id === committed.frameId || !event?.frame?.parentId) poisonDocument();
  };
  const onDetached = (event: any) => {
    if (!active()) { if (!disposed && !unavailable) disable(); return; }
    if (!committed || event?.frameId === committed.frameId) disable();
  };

  return {
    bindNativeSession(sharedSession: CDPSession, bindingOptions: OneTrustNativeBindingOptions = {}) {
      if (disposed || session) { disable(); return; }
      session = sharedSession;
      options = bindingOptions;
      if (!active()) { disable(); return; }
      try {
        for (const [method, listener] of [
          ["Page.frameNavigated", onCommit], ["Page.navigatedWithinDocument", onWithinDocument],
          ["Page.documentOpened", onDocumentOpened], ["Page.frameDetached", onDetached], ["Disconnected", disable],
        ] as const) {
          sharedSession.on(method as any, listener);
          listeners.push({ method, listener });
        }
        options.signal?.addEventListener("abort", disable, { once: true });
        page.on("close", disable);
        page.on("crash", disable);
        const setupStartedAtEpochMs = Date.now(), setupBudgetMs = remainingMs();
        setupTimer = setTimeout(disable, setupBudgetMs);
        setupTimer.unref?.();
        void sharedSession.send("Page.enable").then(() => {
          if (!active()) return;
          if (Date.now() < setupStartedAtEpochMs || Date.now() - setupStartedAtEpochMs > setupBudgetMs) { disable(); return; }
          enabled = true;
          checkpoint();
        }).catch(disable).finally(() => { if (setupTimer) clearTimeout(setupTimer); setupTimer = undefined; });
      } catch { disable(); }
    },
    sourceVerified() {
      // Pending body proof may finish after the commit was paired. This can
      // establish only a new proof after a readback, never an earlier baseline.
      if (checkpointNeeded && checkpointKind === "documentCommit" && !candidate) {
        candidate = input.source(); checkpoint();
      }
    },
    currentDocument(allowUnpairedCommit = false): OneTrustNativeDocument | undefined {
      const paired = committed && pairedCommit && sameDocument(committed, pairedCommit) &&
        !nativeEvents.length && !playwrightEvents.length;
      const singleNativeCommit = allowUnpairedCommit && !pairedCommit && !playwrightEvents.length &&
        nativeEvents.length === 1 && nativeEvents[0]?.kind === "commit";
      return active() && enabled && !documentPoisoned && committed && (paired || singleNativeCommit) &&
        page.url() === committed.url ? { ...committed } : undefined;
    },
    playwrightNavigated(frame: Frame) {
      if (disposed || frame !== page.mainFrame()) return;
      if (!session || !active()) { input.invalidate(); return; }
      suspend();
      const url = page.url();
      if (typeof url !== "string" || url.length > 8192) { disable(); return; }
      // An actual native full commit can establish a new URL; a same-document
      // URL change must never regain historical source when the URL returns.
      if (committed && url !== committed.url) poisonDocument();
      playwrightEvents.push(url);
      pair();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      candidate = undefined;
      if (setupTimer) clearTimeout(setupTimer);
      if (checkpointTimer) clearTimeout(checkpointTimer);
      options.signal?.removeEventListener("abort", disable);
      page.off("close", disable);
      page.off("crash", disable);
      for (const { method, listener } of listeners) {
        try { session?.off(method as any, listener); } catch { /* The session owner may have already detached. */ }
      }
      // The existing DOMStorage capture owns this session and its teardown.
    },
  };
}
