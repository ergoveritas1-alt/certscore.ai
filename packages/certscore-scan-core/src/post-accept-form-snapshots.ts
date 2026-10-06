import { createHash, randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { postAcceptFormSnapshotCaptureSchema, postAcceptFormInventorySchema, type PostAcceptFormSnapshotCapture } from "@certscore/contracts";
import { captureCollectionSurfaceInventory } from "./scanners/pre-consent-runtime-scanner.js";
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
    let presenceDiagnostics: { maxVisibleFields: number; visibleFields: number; stableForMs: number } | undefined;
    let cdp: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>> | undefined;
    try {
      if (!active()) return;
      const exclusion = KNOWN_CMP_REGISTRY.flatMap(cmp => cmp.formExclusionSelectors ?? cmp.domSelectors ?? []).join(",");
      // One bounded presence gate; require a brief stable field set before the
      // single inventory sample, so independently mounted forms can coalesce.
      const presence = await input.page.evaluate<{ present: boolean; maxVisibleFields: number; visibleFields: number; stableForMs: number }>(String.raw`new Promise(resolve => {
        const deadline = ${input.deadlineAtMs - 500};
        const selector = ${JSON.stringify(exclusion)};
        let previous = "", changedAt = Date.now();
        let maxVisibleFields = 0, nextIdentity = 0;
        const identities = new WeakMap();
        const identity = node => {
          if (!identities.has(node)) identities.set(node, ++nextIdentity);
          return identities.get(node);
        };
        const poll = () => {
          const controls = Array.from(document.querySelectorAll('input,textarea,select')).slice(0,250)
            .filter(control => {
              const form = control.closest('form,[role="form"]');
              if (!form || form.closest(selector) || control.closest('[hidden],[inert],[aria-hidden="true"]') ||
                ['hidden','submit','button','reset','image'].includes(control.getAttribute('type'))) return false;
              const bounds = control.getBoundingClientRect(), style = getComputedStyle(control);
              return bounds.width > 0 && bounds.height > 0 && style.display !== "none" &&
                style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
            });
          // Fields must coalesce, but page animation and unrelated layout shifts
          // must not consume the capture window. Pixel acquisition separately
          // freezes animation and verifies the exact crop and input masks.
          const signature = controls.map(control => [identity(control),identity(control.closest('form,[role="form"]')),control.tagName,control.getAttribute('id'),control.getAttribute('name'),control.getAttribute('type')].join(':')).join('|');
          if (signature !== previous) { previous = signature; changedAt = Date.now(); }
          maxVisibleFields = Math.max(maxVisibleFields, controls.length);
          const stableForMs = Date.now() - changedAt;
          const diagnostics = { maxVisibleFields, visibleFields: controls.length, stableForMs };
          if (controls.length && stableForMs >= 250) return resolve({ present: true, ...diagnostics });
          if (Date.now() >= deadline) return resolve({ present: false, ...diagnostics });
          setTimeout(poll, Math.min(50, Math.max(1,deadline-Date.now())));
        };
        poll();
      })`);
      const { present, ...diagnostics } = presence;
      presenceDiagnostics = diagnostics;
      if (!present) return;
      if (!active()) return;
      stage = "document_binding";
      cdp = await input.page.context().newCDPSession(input.page);
      const before = await cdp.send("Page.getFrameTree");
      const token = before.frameTree.frame.loaderId;
      if (!token || !active()) return;
      stage = "inventory";
      const raw = await captureCollectionSurfaceInventory(input.page, input.parentScanStartedAtMs, input.exactTargetUrl);
      const inventory = postAcceptFormInventorySchema.parse({
        contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation",
        phase: "after_accept", coverage: "bounded_sample", pageUrl: raw.pageUrl, forms: raw.forms.slice(0, 2).map(form => ({ ...form,
          evidenceRefs: form.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"})),
          fields: form.fields.map(field => ({...field, evidenceRefs: field.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"}))})),
        })),
      });
      if (!inventory.forms.length || inventory.pageUrl !== input.exactTargetUrl || !active()) return;
      stage = "images";
      const snapshots = await captureCollectionSurfaceSnapshots(input.page, inventory, input.reviewer, signal);
      if (!active()) return;
      const after = await cdp.send("Page.getFrameTree");
      if (after.frameTree.frame.loaderId !== token || !active()) return;
      stage = "packet_validation";
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
    finally { if (!result) console.warn("[post-accept-form-snapshot-incomplete]", JSON.stringify({stage, changed, aborted:signal.aborted, deadlineExpired:Date.now() >= input.deadlineAtMs, presence:presenceDiagnostics})); done = true; await cdp?.detach().catch(() => {}); }
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
