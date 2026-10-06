import { createHash, randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { postAcceptFormSnapshotCaptureSchema, postAcceptFormInventorySchema, type PostAcceptFormSnapshotCapture } from "@certscore/contracts";
import { capturePostAcceptFormInventory } from "./post-accept-form-inventory.js";
import { captureCollectionSurfaceSnapshots, type FormSnapshotReviewer } from "./collection-surface-snapshots.js";

/** Optional registered form capture overlaps the existing action window. finish
 * never waits and cancels pending work; no late pixels can enter the packet. */
export function startRegisteredPostAcceptFormSnapshots(input: {
  page: Page; exactTargetUrl: string; parentScanStartedAtMs: number;
  actionDispatchedAtMs: number; acceptanceRegisteredAtMs: number;
  deadlineAtMs: number; reviewer: FormSnapshotReviewer; signal?: AbortSignal;
}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(input.signal ? [input.signal] : [])]);
  let frozen = false, done = false, changed = false;
  let result: PostAcceptFormSnapshotCapture | undefined;
  const navigated = (frame: import("playwright").Frame) => { if (frame === input.page.mainFrame()) changed = true; };
  input.page.on("framenavigated", navigated);
  const active = () => !frozen && !changed && !signal.aborted && !input.page.isClosed() &&
    Date.now() < input.deadlineAtMs && input.page.url() === input.exactTargetUrl;
  const timer = setTimeout(() => controller.abort(), Math.max(1, input.deadlineAtMs - Date.now()));
  timer.unref?.();
  void (async () => {
    let stage = "presence";
    const stageStartedAtMs = Date.now();
    const stageTimingsMs: Record<string, number> = {};
    const nextStage = (name: string) => { stageTimingsMs[stage] = Date.now() - stageStartedAtMs; stage = name; };
    let presenceDiagnostics: { maxVisibleFields: number; visibleFields: number; stableForMs: number } | undefined;
    let snapshotDiagnostics: Array<{ status: string; reason?: string }> | undefined;
    let cdp: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | undefined;
    let documentBinding: Promise<{ session: NonNullable<typeof cdp>; token: string | undefined }> | undefined;
    try {
      if (!active()) return;
      // Start document proof while the independently mounted fields settle.
      // Its loader is checked again after pixels, so an intervening navigation
      // still discards the capture.
      documentBinding = input.page.context().newCDPSession(input.page).then(async session => {
        try {
          const before = await session.send("Page.getFrameTree");
          return { session, token: before.frameTree.frame.loaderId };
        } catch (error) {
          await session.detach().catch(() => {});
          throw error;
        }
      });
      void documentBinding.then(({ session }) => {
        if (done || frozen || signal.aborted) void session.detach().catch(() => {});
      }).catch(() => {});
      const exclusionSelectors = KNOWN_CMP_REGISTRY.flatMap(cmp => cmp.formExclusionSelectors ?? cmp.domSelectors ?? []);
      const exclusion = exclusionSelectors.join(",");
      // HubSpot mounts fields late. Observe that DOM insertion directly so a
      // background-tab timer cannot consume the remaining image window.
      const presence = await input.page.evaluate<{ present: boolean; maxVisibleFields: number; visibleFields: number; stableForMs: number }>(String.raw`new Promise(resolve => {
        const deadline = ${input.deadlineAtMs - 500};
        const selector = ${JSON.stringify(exclusion)};
        let maxVisibleFields = 0, timer, finished = false, queued = false;
        const observer = new MutationObserver(() => {
          if (queued || finished) return;
          queued = true;
          queueMicrotask(() => { queued = false; poll(); });
        });
        const finish = value => {
          if (finished) return;
          finished = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(value);
        };
        const poll = () => {
          if (finished) return;
          const controls = Array.from(document.querySelectorAll('input,textarea,select')).slice(0,250)
            .filter(control => {
              const form = control.closest('form,[role="form"]');
              if (!form || form.closest(selector) || control.closest('[hidden],[inert],[aria-hidden="true"]') ||
                ['hidden','submit','button','reset','image'].includes(control.getAttribute('type'))) return false;
              const bounds = control.getBoundingClientRect(), style = getComputedStyle(control);
              return bounds.width > 0 && bounds.height > 0 && style.display !== "none" &&
                style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
            });
          maxVisibleFields = Math.max(maxVisibleFields, controls.length);
          const diagnostics = { maxVisibleFields, visibleFields: controls.length, stableForMs: 0 };
          if (controls.length) return finish({ present: true, ...diagnostics });
          if (Date.now() >= deadline) return finish({ present: false, ...diagnostics });
          clearTimeout(timer);
          timer = setTimeout(poll, Math.min(50, Math.max(1,deadline-Date.now())));
        };
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class','style','hidden','aria-hidden'] });
        poll();
      })`);
      const { present, ...diagnostics } = presence;
      presenceDiagnostics = diagnostics;
      if (!present) return;
      if (!active()) return;
      nextStage("document_binding");
      const binding = await documentBinding;
      cdp = binding.session;
      const token = binding.token;
      if (!token || !active()) return;
      nextStage("inventory");
      const raw = await capturePostAcceptFormInventory(input.page, input.parentScanStartedAtMs, exclusionSelectors);
      const inventory = postAcceptFormInventorySchema.parse({
        contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation",
        phase: "after_accept", coverage: "bounded_sample", pageUrl: raw.pageUrl, forms: raw.forms.slice(0, 2).map(form => ({ ...form,
          evidenceRefs: form.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"})),
          fields: form.fields.map(field => ({...field, evidenceRefs: field.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"}))})),
        })),
      });
      if (!inventory.forms.length || inventory.pageUrl !== input.exactTargetUrl || !active()) return;
      nextStage("images");
      const snapshots = await captureCollectionSurfaceSnapshots(input.page, inventory, input.reviewer, signal, cdp, input.deadlineAtMs - 150);
      snapshotDiagnostics = snapshots.map(snapshot => ({ status: snapshot.status, ...(snapshot.reason ? { reason: snapshot.reason } : {}) }));
      if (!active()) return;
      nextStage("final_document_binding");
      const after = await cdp.send("Page.getFrameTree");
      if (after.frameTree.frame.loaderId !== token || !active()) return;
      nextStage("packet_validation");
      result = postAcceptFormSnapshotCaptureSchema.parse({
        contractVersion: "certscore.post_accept_form_snapshots.v1", phase: "after_accept",
        sessionId: randomUUID(), exactTargetSha256: createHash("sha256").update(input.exactTargetUrl).digest("hex"),
        actionDispatchedAtMs: input.actionDispatchedAtMs, acceptanceRegisteredAtMs: input.acceptanceRegisteredAtMs,
        capturedAtMs: Date.now() - input.parentScanStartedAtMs,
        documentIdentity: { source: "cdp_loader_id", token }, inventory, snapshots,
      });
    } catch (error) {
      console.warn("[post-accept-form-snapshots]", JSON.stringify({stage, failureClass:error instanceof Error ? error.name : "unknown", issues: (error as {issues?: Array<{path: unknown; code: unknown}>}).issues?.map(issue => ({path:issue.path,code:issue.code})), deadlineExpired:Date.now() >= input.deadlineAtMs}));
    }
    finally { if (!result) console.warn("[post-accept-form-snapshot-incomplete]", JSON.stringify({stage, stageTimingsMs, elapsedMs:Date.now()-stageStartedAtMs, changed, aborted:signal.aborted, deadlineExpired:Date.now() >= input.deadlineAtMs, presence:presenceDiagnostics, snapshots:snapshotDiagnostics})); done = true; if (!cdp) void documentBinding?.then(({session}) => session.detach()).catch(() => {}); await cdp?.detach().catch(() => {}); }
  })();
  return {
    done: () => done || !active(),
    finish() {
      frozen = true; controller.abort(); clearTimeout(timer);
      input.page.off("framenavigated", navigated);
      return changed || input.signal?.aborted || input.page.isClosed() || input.page.url() !== input.exactTargetUrl ? undefined : result;
    },
  };
}
