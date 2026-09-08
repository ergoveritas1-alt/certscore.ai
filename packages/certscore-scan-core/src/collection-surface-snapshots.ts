import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Page } from "playwright";
import { collectionSurfaceSnapshotSchema, type CollectionSurfaceInventory, type CollectionSurfaceSnapshot } from "@certscore/contracts";

export type FormSnapshotReviewer = (input: { bytes: Buffer; mimeType: "image/jpeg"; signal?: AbortSignal }) => Promise<{ safeForDisplay: boolean }>;
export const FORM_SNAPSHOT_BUDGET_MS = 2500;
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

/** Same-session, masked, low-resolution crops. No form action, values, or pixel-derived findings. */
export async function captureCollectionSurfaceSnapshots(page: Page, inventory: CollectionSurfaceInventory, review: FormSnapshotReviewer, signal?: AbortSignal): Promise<CollectionSurfaceSnapshot[]> {
  const sourceInventoryHash = hash(JSON.stringify(inventory));
  const deadline = Date.now() + FORM_SNAPSHOT_BUDGET_MS;
  const results: Array<CollectionSurfaceSnapshot | Promise<CollectionSurfaceSnapshot>> = [];
  for (const form of inventory.forms) {
    const base = { contractVersion: "certscore.collection-surface-snapshot.v1" as const, formRef: form.formRef, pageUrl: inventory.pageUrl, capturedAt: new Date().toISOString(), sourceInventoryHash, mimeType: "image/jpeg" as const, valuesMasked: true as const };
    const unavailable = () => collectionSurfaceSnapshotSchema.parse({ ...base, status: "unavailable" });
    if (signal?.aborted || Date.now() >= deadline || page.url() !== inventory.pageUrl || !form.fields.length || form.fields.some(f => f.controlIndex === undefined)) {
      results.push(unavailable()); continue;
    }
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
        const group = (el: Element) => structure === "native_form" ? el.closest("form") : structure === "role_form" ? el.closest('[role="form"]') : null;
        const root = group(controls[0]!);
        if (!root || controls.some(el => group(el!) !== root)) return null;
        return root;
      }, { fields: form.fields, structure: form.structure, url: inventory.pageUrl });
      const element = target.asElement();
      if (!element) { results.push(unavailable()); continue; }
      const bounds = await element.boundingBox();
      if (!bounds || bounds.width * bounds.height > 40_000_000) { results.push(unavailable()); continue; }
      const remaining = Math.max(1, deadline - Date.now());
      const original = await element.screenshot({ type: "jpeg", quality: 45, scale: "css", timeout: Math.min(1000, remaining), mask: [page.locator('input, textarea, select, [role="checkbox"], [role="switch"], [contenteditable]')], maskColor: "#94a3b8", caret: "hide" });
      if (signal?.aborted || page.url() !== inventory.pageUrl || Date.now() >= deadline) { results.push(unavailable()); continue; }
      const { data, info } = await sharp(original, { limitInputPixels: 40_000_000 }).resize({ width: 640, height: 960, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 45 }).toBuffer({ resolveWithObject: true });
      if (data.byteLength > 96 * 1024) { results.push(unavailable()); continue; }
      const boundedSignal = AbortSignal.any([AbortSignal.timeout(Math.max(1, deadline - Date.now())), ...(signal ? [signal] : [])]);
      results.push(review({ bytes: data, mimeType: "image/jpeg", signal: boundedSignal }).then(outcome => {
        if (boundedSignal.aborted || page.url() !== inventory.pageUrl) return unavailable();
        return collectionSurfaceSnapshotSchema.parse(outcome.safeForDisplay ? { ...base, status: "available", width: info.width, height: info.height, sizeBytes: data.byteLength, sha256: hash(data), data: data.toString("base64") } : { ...base, status: "withheld" });
      }).catch(unavailable));
    } catch { results.push(unavailable()); }
    finally { await target?.dispose().catch(() => {}); }
  }
  return Promise.all(results);
}
