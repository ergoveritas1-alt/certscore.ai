import { createHash } from "node:crypto";
import sharp from "sharp";
import { captureMaskedFormScreenshot } from "./masked-form-screenshot";
import type { Page } from "playwright";
import { collectionSurfaceSnapshotSchema, type CollectionSurfaceInventory, type CollectionSurfaceSnapshot } from "@certscore/contracts";

export type FormSnapshotReviewer = (input: { bytes: Buffer; mimeType: "image/jpeg"; signal?: AbortSignal }) => Promise<{ safeForDisplay: boolean }>;
export type FormSnapshotInventory = Pick<CollectionSurfaceInventory, "pageUrl" | "forms">;
export const FORM_SNAPSHOT_BUDGET_MS = 2500;
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

/** Same-session, masked, low-resolution crops. No form action, values, or pixel-derived findings. */
export async function captureCollectionSurfaceSnapshots(page: Page, inventory: FormSnapshotInventory, review: FormSnapshotReviewer, signal?: AbortSignal): Promise<CollectionSurfaceSnapshot[]> {
  const controller = new AbortController();
  const boundedSignal = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + FORM_SNAPSHOT_BUDGET_MS;
  try {
    return await Promise.race([
      captureWithinBudget(page, inventory, review, deadline, boundedSignal),
      new Promise<CollectionSurfaceSnapshot[]>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          const sourceInventoryHash = hash(JSON.stringify(inventory));
          resolve(inventory.forms.map(form => collectionSurfaceSnapshotSchema.parse({
            contractVersion: "certscore.collection-surface-snapshot.v1",
            formRef: form.formRef, pageUrl: inventory.pageUrl,
            capturedAt: new Date().toISOString(), sourceInventoryHash,
            mimeType: "image/jpeg", valuesMasked: true, status: "unavailable",
            reason: signal?.aborted ? "capture_cancelled" : "capture_budget_exhausted",
          })));
        }, Math.max(1, deadline - Date.now()));
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function captureWithinBudget(page: Page, inventory: FormSnapshotInventory, review: FormSnapshotReviewer, deadline: number, signal: AbortSignal): Promise<CollectionSurfaceSnapshot[]> {
  const sourceInventoryHash = hash(JSON.stringify(inventory));
  const results: Array<CollectionSurfaceSnapshot | Promise<CollectionSurfaceSnapshot>> = [];
  for (const form of inventory.forms) {
    const base = { contractVersion: "certscore.collection-surface-snapshot.v1" as const, formRef: form.formRef, pageUrl: inventory.pageUrl, capturedAt: new Date().toISOString(), sourceInventoryHash, mimeType: "image/jpeg" as const, valuesMasked: true as const };
    const unavailable = (reason: NonNullable<CollectionSurfaceSnapshot["reason"]>) => collectionSurfaceSnapshotSchema.parse({ ...base, status: "unavailable", reason });
    if (signal?.aborted || Date.now() >= deadline || page.url() !== inventory.pageUrl || !form.fields.length || form.fields.some(f => f.controlIndex === undefined)) {
      results.push(unavailable(signal?.aborted ? "capture_cancelled" : Date.now() >= deadline ? "capture_budget_exhausted" : page.url() !== inventory.pageUrl ? "document_changed" : "control_identity_unavailable")); continue;
    }
    let stage: NonNullable<CollectionSurfaceSnapshot["reason"]> = "control_binding_changed";
    let target: Awaited<ReturnType<Page["evaluateHandle"]>> | undefined;
    try {
      // Resolve the exact retained controls, checking document/type/group binding before taking pixels.
      target = await page.evaluateHandle(({ fields, structure, url }) => {
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
        if (structure === "unassociated_controls") {
          if (controls.some(el => (el as HTMLInputElement).form || el!.closest('form, [role="form"]'))) return null;
          let common = controls[0]!.parentElement;
          while (common && controls.some(el => !common!.contains(el))) common = common.parentElement;
          return common;
        }
        const root = group(controls[0]!);
        if (!root || controls.some(el => group(el!) !== root)) return null;
        let cropRoot: Element | null = root;
        while (cropRoot && controls.some(el => !cropRoot!.contains(el))) cropRoot = cropRoot.parentElement;
        return cropRoot;
      }, { fields: form.fields, structure: form.structure, url: inventory.pageUrl });
      if (signal.aborted || Date.now() >= deadline) {
        results.push(unavailable("capture_budget_exhausted")); continue;
      }
      const element = target.asElement();
      if (!element) { results.push(unavailable("control_binding_changed")); continue; }
      const remaining = Math.max(1, deadline - Date.now());
      stage = "screenshot_failed";
      const original = await captureMaskedFormScreenshot(page, element, remaining);
      if (signal?.aborted || page.url() !== inventory.pageUrl || Date.now() >= deadline) { results.push(unavailable(signal?.aborted ? "capture_cancelled" : page.url() !== inventory.pageUrl ? "document_changed" : "capture_budget_exhausted")); continue; }
      stage = "image_processing_failed";
      const { data, info } = await sharp(original, { limitInputPixels: 40_000_000 }).resize({ width: 640, height: 960, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 45 }).toBuffer({ resolveWithObject: true });
      if (data.byteLength > 96 * 1024) { results.push(unavailable("image_size_exceeded")); continue; }
      const boundedSignal = AbortSignal.any([AbortSignal.timeout(Math.max(1, deadline - Date.now())), ...(signal ? [signal] : [])]);
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
          if (signal?.aborted) return unavailable("capture_cancelled");
          if (boundedSignal.aborted) return unavailable("review_timed_out");
          if (page.url() !== inventory.pageUrl) return unavailable("document_changed");
          return collectionSurfaceSnapshotSchema.parse(outcome.safeForDisplay ? { ...base, status: "available", width: info.width, height: info.height, sizeBytes: data.byteLength, sha256: hash(data), data: data.toString("base64") } : { ...base, status: "withheld", reason: "review_withheld" });
        } catch { return unavailable(signal?.aborted ? "capture_cancelled" : boundedSignal.aborted ? "review_timed_out" : "review_failed"); }
        finally { if (onAbort) boundedSignal.removeEventListener("abort", onAbort); }
      })());
    } catch (error) {
      if (error instanceof Error && error.message === "Form screenshot bounds unavailable") stage = "form_not_visible";
      if (error instanceof Error && error.message === "Form screenshot bounds exceeded") stage = "form_bounds_exceeded";
      results.push(unavailable(signal?.aborted ? "capture_cancelled" : page.url() !== inventory.pageUrl ? "document_changed" : stage)); }
    finally { await target?.dispose().catch(() => {}); }
  }
  return Promise.all(results);
}
