import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { capturePreparedMaskedFormScreenshot, cleanupPreparedMaskedFormScreenshot,
  type PreparedMaskedFormScreenshot } from "./masked-form-screenshot";
import type { CDPSession, Page } from "playwright";
import { collectionSurfaceSnapshotSchema, type CollectionSurfaceInventory, type CollectionSurfaceSnapshot } from "@certscore/contracts";

export type FormSnapshotReviewer = (input: { bytes: Buffer; mimeType: "image/jpeg"; signal?: AbortSignal }) => Promise<{ safeForDisplay: boolean }>;
export type FormSnapshotInventory = Pick<CollectionSurfaceInventory, "pageUrl" | "forms">;
export type FormSnapshotCaptureOptions = {
  pixelSignal?: AbortSignal;
  pixelBudgetMs?: number;
  reviewDeadlineAtMs?: number;
  onMaskedPixelsCaptured?: () => Promise<void>;
  layoutRetryAllowed?: boolean;
  maxCropHeight?: number;
  hideControlsDuringCapture?: boolean;
  sourceInventoryHash?: string;
};
export const FORM_SNAPSHOT_BUDGET_MS = 2500;
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

/** Same-session, masked, low-resolution crops. No form action, values, or pixel-derived findings. */
export async function captureCollectionSurfaceSnapshots(page: Page, inventory: FormSnapshotInventory, review: FormSnapshotReviewer, signal?: AbortSignal, boundSession?: CDPSession, deadlineAtMs?: number, options?: FormSnapshotCaptureOptions): Promise<CollectionSurfaceSnapshot[]> {
  const controller = new AbortController();
  const reviewSignal = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
  const pixelSignal = options?.pixelSignal ?? reviewSignal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budgetMs = Math.max(1, Math.min(10_500, options?.pixelBudgetMs ?? FORM_SNAPSHOT_BUDGET_MS));
  const deadline = Math.min(Date.now() + budgetMs, deadlineAtMs ?? Number.POSITIVE_INFINITY);
  const reviewDeadline = Math.max(deadline, Math.min(Date.now() + budgetMs, options?.reviewDeadlineAtMs ?? deadline));
  const completed = new Map<string, CollectionSurfaceSnapshot>();
  const startedAtMs = Date.now();
  let activeStage = "start";
  const pendingReviews = new Map<number, number>();
  try {
    return await Promise.race([
      captureWithinBudget(page, inventory, review, deadline, pixelSignal, reviewSignal, reviewDeadline, boundSession,
        options?.sourceInventoryHash ?? hash(JSON.stringify(inventory)), signal, options,
        snapshot => { if (!reviewSignal.aborted) completed.set(snapshot.formRef, snapshot); }, options?.onMaskedPixelsCaptured,
        stage => { activeStage = stage; },
        index => { pendingReviews.set(index, Date.now()); }, index => { pendingReviews.delete(index); }),
      new Promise<CollectionSurfaceSnapshot[]>(resolve => {
        timer = setTimeout(() => {
          console.warn("[form-snapshot-budget]", JSON.stringify({ stage: activeStage,
            elapsedMs: Date.now() - startedAtMs, formCount: inventory.forms.length, completedCount: completed.size,
            pendingReviewCount: pendingReviews.size,
            oldestReviewMs: pendingReviews.size ? Date.now() - Math.min(...pendingReviews.values()) : undefined }));
          controller.abort();
          const sourceInventoryHash = options?.sourceInventoryHash ?? hash(JSON.stringify(inventory));
          resolve(inventory.forms.map(form => completed.get(form.formRef) ?? collectionSurfaceSnapshotSchema.parse({
            contractVersion: "certscore.collection-surface-snapshot.v1",
            formRef: form.formRef, pageUrl: inventory.pageUrl,
            capturedAt: new Date().toISOString(), sourceInventoryHash,
            mimeType: "image/jpeg", valuesMasked: true, status: "unavailable",
            reason: signal?.aborted ? "capture_cancelled" : "capture_budget_exhausted",
          })));
        }, Math.max(1, reviewDeadline - Date.now()));
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function captureWithinBudget(page: Page, inventory: FormSnapshotInventory, review: FormSnapshotReviewer, deadline: number, pixelSignal: AbortSignal, reviewSignal: AbortSignal, reviewDeadline: number, boundSession: CDPSession | undefined, sourceInventoryHash: string, signal: AbortSignal | undefined, options: FormSnapshotCaptureOptions | undefined, onCompleted: (snapshot: CollectionSurfaceSnapshot) => void, onMaskedPixelsCaptured?: () => Promise<void>, onStage?: (stage: string) => void, onReviewStarted?: (index: number) => void, onReviewFinished?: (index: number) => void): Promise<CollectionSurfaceSnapshot[]> {
  const results: Array<CollectionSurfaceSnapshot | Promise<CollectionSurfaceSnapshot>> = [];
  let reusableSession = boundSession;
  const retain = (snapshot: CollectionSurfaceSnapshot) => { onCompleted(snapshot); return snapshot; };
  for (const [formIndex, form] of inventory.forms.entries()) {
    const base = { contractVersion: "certscore.collection-surface-snapshot.v1" as const, formRef: form.formRef, pageUrl: inventory.pageUrl, capturedAt: new Date().toISOString(), sourceInventoryHash, mimeType: "image/jpeg" as const, valuesMasked: true as const };
    const unavailable = (reason: NonNullable<CollectionSurfaceSnapshot["reason"]>) => collectionSurfaceSnapshotSchema.parse({ ...base, status: "unavailable", reason });
    if (pixelSignal.aborted || Date.now() >= deadline || page.url() !== inventory.pageUrl || !form.fields.length || form.fields.some(f => f.controlIndex === undefined)) {
      results.push(retain(unavailable(pixelSignal.aborted ? "capture_cancelled" : Date.now() >= deadline ? "capture_budget_exhausted" : page.url() !== inventory.pageUrl ? "document_changed" : "control_identity_unavailable"))); continue;
    }
    let stage: NonNullable<CollectionSurfaceSnapshot["reason"]> = "control_binding_changed";
    let prepared: PreparedMaskedFormScreenshot | null = null;
    let captureStarted = false;
    try {
      onStage?.(`form_${formIndex}_bind_controls`);
      // Bind retained controls, freeze motion and collect the first layout in
      // one browser call. A second call can miss late SITS forms entirely.
      prepared = await page.evaluate(({ fields, structure, url, token, maxCropHeight, hideControlsDuringCapture }) => {
        const scope = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
        scope.__name ??= function(target) { return target; };
        if (location.href !== url) return null;
        const all = document.querySelectorAll('input, textarea, select, [role="checkbox"], [role="switch"]');
        const controls = fields.map(f => all.item(f.controlIndex!));
        if (controls.some((el, i) => !el || (["input", "textarea", "select"].includes(el.tagName.toLowerCase()) ? el.tagName.toLowerCase() : "custom_control") !== fields[i]!.elementType || (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase() !== fields[i]!.inputType)) return null;
        const bounded = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
        const labelFor = (el: Element) => {
          const id = el.getAttribute("id");
          const explicit = id ? Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)).map(l => bounded(l.textContent)).find(Boolean) : undefined;
          return explicit ?? bounded(el.closest("label")?.textContent) ?? bounded(el.getAttribute("aria-label")) ?? bounded(el.getAttribute("placeholder")) ?? bounded(el.getAttribute("name"));
        };
        if (controls.some((el, i) => labelFor(el!) !== fields[i]!.label || ((el as HTMLInputElement).required === true || el!.getAttribute("aria-required") === "true") !== fields[i]!.required)) return null;
        const group = (el: Element) => structure === "native_form" ? (el as HTMLInputElement).form ?? el.closest("form") : structure === "role_form" ? el.closest('[role="form"]') : null;
        let root: Element | null;
        if (structure === "unassociated_controls") {
          if (controls.some(el => (el as HTMLInputElement).form || el!.closest('form, [role="form"]'))) return null;
          let common = controls[0]!.parentElement;
          while (common && controls.some(el => !common!.contains(el))) common = common.parentElement;
          root = common;
        } else {
          root = group(controls[0]!);
          if (!root || controls.some(el => group(el!) !== root)) return null;
          while (root && controls.some(el => !root!.contains(el))) root = root.parentElement;
        }
        if (!root) return null;
        const animationSet = new Set<Animation>();
        for (let current: Element | null = root; current; current = current.parentElement) {
          for (const animation of current.getAnimations({ subtree: current === root })) animationSet.add(animation);
        }
        const animations = Array.from(animationSet);
        if (animations.length > 1000) throw new Error("Form screenshot animation inventory exceeded");
        const runningAnimations = animations.filter(animation => animation.playState === "running");
        for (const animation of runningAnimations) animation.pause();
        const position = { x: scrollX, y: scrollY };
        const scrollPositions = [];
        for (let parent = root.parentElement; parent; parent = parent.parentElement) {
          scrollPositions.push({ element: parent, x: parent.scrollLeft, y: parent.scrollTop });
        }
        const attribute = "data-certscore-form-capture";
        const markerRoot = document.documentElement;
        const previous = markerRoot.getAttribute(attribute);
        markerRoot.setAttribute(attribute, token);
        const node = document.createElement("style");
        const cssScope = `html[${attribute}="${token}"]`;
        node.textContent = `${cssScope},${cssScope} *,${cssScope}::before,${cssScope}::after,${cssScope} *::before,${cssScope} *::after{animation-play-state:paused!important;transition-property:none!important;caret-color:transparent!important}` +
          (hideControlsDuringCapture ? `${cssScope} input,${cssScope} textarea,${cssScope} select,${cssScope} [role="checkbox"],${cssScope} [role="switch"],${cssScope} [contenteditable]{clip-path:inset(100%)!important;-webkit-clip-path:inset(100%)!important}` : "");
        document.documentElement.appendChild(node);
        const state = { root, node, markerRoot, attribute, previous, position, scrollPositions, animations: runningAnimations,
          hideControlsDuringCapture };
        const restore = () => {
          node.remove();
          for (const animation of runningAnimations) if (animation.playState === "paused") animation.play();
          if (previous === null) markerRoot.removeAttribute(attribute);
          else markerRoot.setAttribute(attribute, previous);
        };
        try {
          if (runningAnimations.some(animation => animation.playState === "running")) throw new Error("Form screenshot animation did not pause");
          const initial = root.getBoundingClientRect();
          if (initial.left < 0 || initial.top < 0 || initial.right > innerWidth || initial.bottom > innerHeight) {
            // A bounded viewport crop avoids Chromium's costly full-page
            // off-screen rasterization on long pages. Restore all scroll
            // positions after the strict post-pixel layout check.
            root.scrollIntoView({ block: initial.height > innerHeight ? "start" : "center", inline: "center", behavior: "instant" });
          }
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
          };
          const allControls = document.querySelectorAll('input, textarea, select, [role="checkbox"], [role="switch"], [contenteditable]');
          if (!root.isConnected || allControls.length > 1000) throw new Error("Form screenshot binding unavailable");
          const rootBounds = rect(root);
          const viewport = { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight };
          const x = Math.max(rootBounds.x, viewport.x), y = Math.max(rootBounds.y, viewport.y);
          const bounds = { x, y,
            width: Math.max(0, Math.min(rootBounds.x + rootBounds.width, viewport.x + viewport.width) - x),
            height: Math.min(maxCropHeight,
              Math.max(0, Math.min(rootBounds.y + rootBounds.height, viewport.y + viewport.height) - y)) };
          const intersectingControls = Array.from(allControls).filter(control => {
            const r = rect(control);
            return r.width > 0 && r.height > 0 &&
            r.x - 2 < bounds.x + bounds.width && r.y - 2 < bounds.y + bounds.height &&
            r.x + r.width + 2 > bounds.x && r.y + r.height + 2 > bounds.y;
          });
          const masks = intersectingControls.map(rect);
          const controlsRedacted = hideControlsDuringCapture && node.isConnected &&
            markerRoot.getAttribute(attribute) === token && intersectingControls.length > 0 && intersectingControls.every(control =>
            getComputedStyle(control).clipPath === "inset(100%)");
          if (hideControlsDuringCapture && !controlsRedacted) throw new Error("Form screenshot control redaction unavailable");
          (window as any)[`__certscoreFormCapture_${token}`] = state;
          return { token, before: { url: location.href,
            viewport, rootBounds, bounds, masks, controlsRedacted } };
        } catch (error) { restore(); throw error; }
      }, { fields: form.fields, structure: form.structure, url: inventory.pageUrl, token: randomUUID(),
        maxCropHeight: Math.max(100, Math.min(10_000, options?.maxCropHeight ?? 10_000)),
        hideControlsDuringCapture: options?.hideControlsDuringCapture === true });
      if (!prepared) { results.push(retain(unavailable("control_binding_changed"))); continue; }
      if (pixelSignal.aborted || Date.now() >= deadline) {
        results.push(retain(unavailable("capture_budget_exhausted"))); continue;
      }
      const remaining = Math.max(1, deadline - Date.now());
      stage = "screenshot_failed";
      onStage?.(`form_${formIndex}_capture_pixels`);
      if (!reusableSession) reusableSession = await page.context().newCDPSession(page);
      captureStarted = true;
      const original = await capturePreparedMaskedFormScreenshot(page, prepared, remaining, reusableSession);
      if (pixelSignal.aborted || page.url() !== inventory.pageUrl || Date.now() >= deadline) { results.push(retain(unavailable(pixelSignal.aborted ? "capture_cancelled" : page.url() !== inventory.pageUrl ? "document_changed" : "capture_budget_exhausted"))); continue; }
      // Prove each masked crop against the original document immediately. A
      // later form may exhaust the pixel window without invalidating this one.
      await onMaskedPixelsCaptured?.();
      if (pixelSignal.aborted || page.url() !== inventory.pageUrl || Date.now() >= deadline) { results.push(retain(unavailable("capture_budget_exhausted"))); continue; }
      stage = "image_processing_failed";
      onStage?.(`form_${formIndex}_mask_and_review`);
      const { data, info } = await sharp(original, { limitInputPixels: 40_000_000 }).resize({ width: 640, height: 960, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 45 }).toBuffer({ resolveWithObject: true });
      if (data.byteLength > 96 * 1024) { results.push(retain(unavailable("image_size_exceeded"))); continue; }
      const boundedSignal = AbortSignal.any([AbortSignal.timeout(Math.max(1, reviewDeadline - Date.now())), reviewSignal]);
      onReviewStarted?.(formIndex);
      results.push((async () => {
        let onAbort: (() => void) | undefined;
        try {
          const outcome = await Promise.race([
            Promise.resolve().then(() => review({ bytes: data, mimeType: "image/jpeg", signal: boundedSignal })),
            new Promise<never>((_, reject) => {
              onAbort = () => reject(new Error("Form snapshot review deadline"));
              boundedSignal.addEventListener("abort", onAbort, { once: true });
              if (boundedSignal.aborted) onAbort();
            }),
          ]);
          if (reviewSignal.aborted) return unavailable("capture_cancelled");
          if (boundedSignal.aborted) return unavailable("review_timed_out");
          if (page.url() !== inventory.pageUrl) return unavailable("document_changed");
          return collectionSurfaceSnapshotSchema.parse(outcome.safeForDisplay ? { ...base, status: "available", width: info.width, height: info.height, sizeBytes: data.byteLength, sha256: hash(data), data: data.toString("base64") } : { ...base, status: "withheld", reason: "review_withheld" });
        } catch { return unavailable(reviewSignal.aborted ? "capture_cancelled" : boundedSignal.aborted ? "review_timed_out" : "review_failed"); }
        finally { onReviewFinished?.(formIndex); if (onAbort) boundedSignal.removeEventListener("abort", onAbort); }
      })().then(retain));
    } catch (error) {
      if (options?.layoutRetryAllowed !== false && error instanceof Error &&
        error.message.startsWith("Form screenshot layout changed:") &&
        !pixelSignal.aborted && page.url() === inventory.pageUrl && Date.now() + 750 < deadline) {
        const retry = await captureCollectionSurfaceSnapshots(page, { pageUrl: inventory.pageUrl, forms: [form] }, review,
          signal, reusableSession, deadline, { ...options, layoutRetryAllowed: false,
            sourceInventoryHash,
            pixelBudgetMs: Math.max(1, deadline - Date.now()), reviewDeadlineAtMs: reviewDeadline });
        results.push(retain(retry[0] ?? unavailable("screenshot_failed")));
        continue;
      }
      // A failed command may still be settling on the shared CDP connection.
      // A later form gets an independent session and cannot reuse its state.
      reusableSession = undefined;
      if (error instanceof Error && error.message === "Form screenshot bounds unavailable") stage = "form_not_visible";
      if (error instanceof Error && error.message === "Form screenshot bounds exceeded") stage = "form_bounds_exceeded";
      results.push(retain(unavailable(pixelSignal.aborted ? "capture_cancelled" : page.url() !== inventory.pageUrl ? "document_changed" : stage))); }
    finally { if (prepared && !captureStarted) void cleanupPreparedMaskedFormScreenshot(page, prepared.token).catch(() => {}); }
  }
  return Promise.all(results);
}
