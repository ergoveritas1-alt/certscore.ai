import { createHash, randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { postAcceptFormSnapshotCaptureSchema, postAcceptFormInventorySchema,
  postAcceptImageInventoryMatchesLaterInventory, type PostAcceptFormSnapshotCapture } from "@certscore/contracts";
import { capturePostAcceptFormInventory } from "./post-accept-form-inventory.js";
import { captureCollectionSurfaceSnapshots, type FormSnapshotReviewer } from "./collection-surface-snapshots.js";

export const LATE_FORM_CAPTURE_EXTENSION_MS = 9_500;
const LATE_FORM_REMAINING_WINDOW_MS = 2_000;
const LATE_FORM_MINIMUM_AGE_MS = 1_000;
const LATER_INVENTORY_WAIT_MS = 900;
const LATER_INVENTORY_RETRY_MS = 650;

function retainedFormInventory(raw: Awaited<ReturnType<typeof capturePostAcceptFormInventory>>) {
  return postAcceptFormInventorySchema.parse({
    contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation",
    phase: "after_accept", coverage: "bounded_sample", pageUrl: raw.pageUrl, forms: raw.forms.slice(0, 2).map(form => ({ ...form,
      evidenceRefs: form.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"})),
      fields: form.fields.map(field => ({...field, evidenceRefs: field.evidenceRefs.map(ref => ({...ref, refId: `after_accept:${ref.refId}`, artifactId: "post_accept_form_inventory"}))})),
    })),
  });
}

/** Optional registered form pixels use the original action window, or one
 * owner-approved bounded extension after a late form is actually seen.
 * Consent observations keep their original window. */
export function startRegisteredPostAcceptFormSnapshots(input: {
  page: Page; exactTargetUrl: string; parentScanStartedAtMs: number;
  actionDispatchedAtMs: number; acceptanceRegisteredAtMs: number;
  deadlineAtMs: number; reviewer: FormSnapshotReviewer; signal?: AbortSignal;
  onLateFormDetected?: () => number | undefined;
}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(input.signal ? [input.signal] : [])]);
  let frozen = false, done = false, changed = false;
  let captureDeadlineAtMs = input.deadlineAtMs;
  let lateFormExtensionActive = false;
  let lateFormDetectedAtMs: number | undefined;
  let result: PostAcceptFormSnapshotCapture | undefined;
  const navigated = (frame: import("playwright").Frame) => { if (frame === input.page.mainFrame()) changed = true; };
  input.page.on("framenavigated", navigated);
  const active = () => !frozen && !changed && !signal.aborted && !input.page.isClosed() &&
    Date.now() < captureDeadlineAtMs && input.page.url() === input.exactTargetUrl;
  let timer: ReturnType<typeof setTimeout>;
  const scheduleCaptureDeadline = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), Math.max(1, captureDeadlineAtMs - Date.now()));
    timer.unref?.();
  };
  const extendForDetectedForm = (raw: Awaited<ReturnType<typeof capturePostAcceptFormInventory>>, detectedAtEpochMs: number) => {
    if (!raw.forms.length || raw.pageUrl !== input.exactTargetUrl || !active() || lateFormExtensionActive ||
      detectedAtEpochMs >= input.deadlineAtMs ||
      detectedAtEpochMs < input.parentScanStartedAtMs + input.acceptanceRegisteredAtMs + LATE_FORM_MINIMUM_AGE_MS ||
      detectedAtEpochMs < input.deadlineAtMs - LATE_FORM_REMAINING_WINDOW_MS) return;
    // Validate the bounded inventory before it can request any extra budget.
    retainedFormInventory(raw);
    const hardDeadlineAtMs = input.onLateFormDetected?.() ?? input.deadlineAtMs + LATE_FORM_CAPTURE_EXTENSION_MS;
    const extendedDeadlineAtMs = Math.min(input.deadlineAtMs + LATE_FORM_CAPTURE_EXTENSION_MS, hardDeadlineAtMs);
    if (extendedDeadlineAtMs <= input.deadlineAtMs) return;
    captureDeadlineAtMs = extendedDeadlineAtMs;
    lateFormExtensionActive = true;
    lateFormDetectedAtMs = detectedAtEpochMs - input.parentScanStartedAtMs;
    scheduleCaptureDeadline();
  };
  scheduleCaptureDeadline();
  const work = (async () => {
    let stage = "inventory_wait";
    const stageStartedAtMs = Date.now();
    const stageTimingsMs: Record<string, number> = {};
    const nextStage = (name: string) => { stageTimingsMs[stage] = Date.now() - stageStartedAtMs; stage = name; };
    let inventoryDiagnostics: { forms: number; fields: number } | undefined;
    let snapshotDiagnostics: Array<{ status: string; reason?: string }> | undefined;
    let pixelProvedAtMs: number | undefined;
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
      // One browser roundtrip waits for late mounted fields and returns their
      // bounded inventory; the document proof was already started in parallel.
      let raw = await capturePostAcceptFormInventory(input.page, input.parentScanStartedAtMs, exclusionSelectors, input.deadlineAtMs - 150,
        { onDetected: extendForDetectedForm, signal });
      inventoryDiagnostics = { forms: raw.forms.length, fields: raw.forms.reduce((count, form) => count + form.fields.length, 0) };
      if (!raw.forms.length) return;
      if (!active()) return;
      // Start masking and safety review on the first directly observed form.
      // A settle-and-resample round trip delayed SITS pixels until too close
      // to the bound worker deadline. Later fields are not inferred from
      // this early crop; independent form evidence may retain them separately.
      nextStage("document_binding");
      const binding = await documentBinding;
      cdp = binding.session;
      const boundSession = binding.session;
      const token = binding.token;
      if (!token || !active()) return;
      nextStage("inventory");
      const inventory = retainedFormInventory(raw);
      if (!inventory.forms.length || inventory.pageUrl !== input.exactTargetUrl || !active()) return;
      let laterInventoryWork: Promise<{capturedAtMs:number; documentIdentity:{source:"cdp_loader_id";token:string}; inventory:typeof inventory} | undefined> | undefined;
      const originalFieldCount = inventory.forms.reduce((count, form) => count + form.fields.length, 0);
      const sampleLaterInventory = async (delayMs: number) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        if (!active()) return undefined;
        const laterRaw = await capturePostAcceptFormInventory(input.page, input.parentScanStartedAtMs, exclusionSelectors, Date.now());
        if (!active()) return undefined;
        const later = retainedFormInventory(laterRaw);
        const after = await boundSession.send("Page.getFrameTree");
        if (!active() || after.frameTree.frame.loaderId !== token ||
          !postAcceptImageInventoryMatchesLaterInventory(inventory, later)) return undefined;
        const laterFieldCount = later.forms.reduce((count, form) => count + form.fields.length, 0);
        const disclosureEnriched = later.forms.some(form => form.privacyDisclosure?.excerpts.length &&
          JSON.stringify(form.privacyDisclosure) !== JSON.stringify(inventory.forms.find(original => original.formRef === form.formRef)?.privacyDisclosure));
        if (later.forms.length <= inventory.forms.length && laterFieldCount <= originalFieldCount && !disclosureEnriched) return undefined;
        return { capturedAtMs: Date.now() - input.parentScanStartedAtMs,
          documentIdentity: { source: "cdp_loader_id" as const, token }, inventory: later };
      };
      nextStage("images");
      const snapshots = await captureCollectionSurfaceSnapshots(input.page, inventory, input.reviewer, input.signal, boundSession,
        captureDeadlineAtMs - 75, {
          pixelSignal: signal,
          maxCropHeight: 480,
          fitFormToCrop: true,
          hideControlsDuringCapture: true,
          ...(lateFormExtensionActive ? { pixelBudgetMs: Math.max(1, captureDeadlineAtMs - Date.now()) } : {}),
          reviewDeadlineAtMs: lateFormExtensionActive ? captureDeadlineAtMs : input.deadlineAtMs + 1500,
          onMaskedPixelsCaptured: async () => {
            if (!active()) return;
            const after = await boundSession.send("Page.getFrameTree");
            if (after.frameTree.frame.loaderId !== token) { changed = true; pixelProvedAtMs = undefined; return; }
            if (active()) {
              pixelProvedAtMs = Date.now() - input.parentScanStartedAtMs;
              // Read the later form DOM while image moderation runs. This is
              // the same session and existing late-form deadline, with no
              // additional browser lane or screenshot.
              if (lateFormExtensionActive && !laterInventoryWork) {
                laterInventoryWork = (async () => {
                  const first = await sampleLaterInventory(LATER_INVENTORY_WAIT_MS);
                  if (first?.inventory.forms.length === 2 || Date.now() + LATER_INVENTORY_RETRY_MS >= captureDeadlineAtMs) return first;
                  const second = await sampleLaterInventory(LATER_INVENTORY_RETRY_MS);
                  if (!first) return second;
                  if (!second) return first;
                  const count = (value: typeof first) => value.inventory.forms.reduce((total, form) => total + form.fields.length, 0);
                  return second.inventory.forms.length > first.inventory.forms.length || count(second) > count(first) ? second : first;
                })().catch(() => undefined);
              }
            }
          },
        });
      snapshotDiagnostics = snapshots.map(snapshot => ({ status: snapshot.status, ...(snapshot.reason ? { reason: snapshot.reason } : {}) }));
      if (pixelProvedAtMs === undefined || changed || input.signal?.aborted || input.page.isClosed() || input.page.url() !== input.exactTargetUrl) return;
      let postCaptureInventory: Awaited<NonNullable<typeof laterInventoryWork>>;
      if (laterInventoryWork && Date.now() < captureDeadlineAtMs) {
        let waitTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          postCaptureInventory = await Promise.race([
            laterInventoryWork,
            new Promise<undefined>(resolve => { waitTimer = setTimeout(() => resolve(undefined),
              Math.max(1, captureDeadlineAtMs - Date.now())); }),
          ]);
        } finally { if (waitTimer) clearTimeout(waitTimer); }
      }
      if (postCaptureInventory && postCaptureInventory.capturedAtMs < pixelProvedAtMs) postCaptureInventory = undefined;
      let postCaptureSnapshots: {capturedAtMs:number; snapshots:typeof snapshots} | undefined;
      const newForms = postCaptureInventory?.inventory.forms.filter(form => !inventory.forms.some(original => original.formRef === form.formRef)) ?? [];
      if (postCaptureInventory && newForms.length && snapshots.length < 2 && active() && Date.now() + 750 < captureDeadlineAtMs) {
        let laterPixelProvedAtMs: number | undefined;
        const extra = await captureCollectionSurfaceSnapshots(input.page, {...postCaptureInventory.inventory,
          forms:newForms.slice(0,2-snapshots.length)}, input.reviewer, input.signal, boundSession,
          captureDeadlineAtMs - 75, {pixelSignal:signal, maxCropHeight:480, fitFormToCrop:true, hideControlsDuringCapture:true,
            pixelBudgetMs:Math.max(1,captureDeadlineAtMs-Date.now()), reviewDeadlineAtMs:captureDeadlineAtMs,
            sourceInventoryHash:createHash("sha256").update(JSON.stringify(postCaptureInventory.inventory)).digest("hex"),
            onMaskedPixelsCaptured:async()=>{
              if (!active()) return;
              const after=await boundSession.send("Page.getFrameTree");
              if (after.frameTree.frame.loaderId !== token) {changed=true;return;}
              if (active()) laterPixelProvedAtMs=Date.now()-input.parentScanStartedAtMs;
            }});
        if (laterPixelProvedAtMs !== undefined && !changed) postCaptureSnapshots={capturedAtMs:laterPixelProvedAtMs,snapshots:extra};
      }
      if (changed || input.signal?.aborted || input.page.isClosed() || input.page.url() !== input.exactTargetUrl) return;
      nextStage("packet_validation");
      result = postAcceptFormSnapshotCaptureSchema.parse({
        ...(lateFormExtensionActive ? {
          contractVersion: postCaptureSnapshots ? "certscore.post_accept_form_snapshots.v6" : postCaptureInventory ? "certscore.post_accept_form_snapshots.v5" : "certscore.post_accept_form_snapshots.v4",
          lateForm: { baseCaptureDeadlineAtMs: input.deadlineAtMs - input.parentScanStartedAtMs,
            detectedAtMs: lateFormDetectedAtMs, extensionMs: LATE_FORM_CAPTURE_EXTENSION_MS },
          ...(postCaptureInventory ? { postCaptureInventory } : {}),
          ...(postCaptureSnapshots ? { postCaptureSnapshots } : {}),
        } : { contractVersion: "certscore.post_accept_form_snapshots.v1" }),
        phase: "after_accept",
        sessionId: randomUUID(), exactTargetSha256: createHash("sha256").update(input.exactTargetUrl).digest("hex"),
        actionDispatchedAtMs: input.actionDispatchedAtMs, acceptanceRegisteredAtMs: input.acceptanceRegisteredAtMs,
        capturedAtMs: pixelProvedAtMs,
        documentIdentity: { source: "cdp_loader_id", token }, inventory, snapshots,
      });
    } catch (error) {
      console.warn("[post-accept-form-snapshots]", JSON.stringify({stage, failureClass:error instanceof Error ? error.name : "unknown", issues: (error as {issues?: Array<{path: unknown; code: unknown}>}).issues?.map(issue => ({path:issue.path,code:issue.code})), deadlineExpired:Date.now() >= captureDeadlineAtMs}));
    }
    finally { if (!result) console.warn("[post-accept-form-snapshot-incomplete]", JSON.stringify({stage, stageTimingsMs, elapsedMs:Date.now()-stageStartedAtMs, changed, aborted:signal.aborted, deadlineExpired:Date.now() >= captureDeadlineAtMs, lateFormExtensionActive, inventory:inventoryDiagnostics, snapshots:snapshotDiagnostics})); done = true; if (!cdp) void documentBinding?.then(({session}) => session.detach()).catch(() => {}); await cdp?.detach().catch(() => {}); }
  })();
  return {
    done: () => done || !active(),
    async finish() {
      // A late detected form may finish the already authorized browser work
      // inside its one-time extension. Ordinary scans still freeze immediately.
      if (!lateFormExtensionActive) { frozen = true; controller.abort(); }
      await work;
      frozen = true; controller.abort(); clearTimeout(timer);
      input.page.off("framenavigated", navigated);
      return changed || input.signal?.aborted || input.page.isClosed() || input.page.url() !== input.exactTargetUrl ? undefined : result;
    },
  };
}
