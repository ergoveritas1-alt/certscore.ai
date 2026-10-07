import { z } from "zod";
import { collectionSurfaceFormSchema } from "./collection-surface-form";
export const postAcceptFormInventorySchema = z.object({
  contractVersion: z.literal("certscore.post_accept_form_inventory.v1"),
  sourceLane: z.literal("accept_observation"),
  phase: z.literal("after_accept"),
  coverage: z.literal("bounded_sample"),
  pageUrl: z.string().url().max(500),
  forms: z.array(collectionSurfaceFormSchema).min(1).max(2),
}).strict();
import { collectionSurfaceSnapshotSchema, collectionSurfaceSnapshotMetadataSchema,
  type CollectionSurfaceSnapshot } from "./collection-surface-snapshot";

type PostAcceptFormSnapshotCommon = {
  phase: "after_accept";
  sessionId: string;
  exactTargetSha256: string;
  actionDispatchedAtMs: number;
  acceptanceRegisteredAtMs: number;
  capturedAtMs: number;
  documentIdentity: { source: "cdp_loader_id"; token: string };
  inventory: z.output<typeof postAcceptFormInventorySchema>;
  snapshots: CollectionSurfaceSnapshot[];
};
type PostCaptureInventory = {
  capturedAtMs: number;
  documentIdentity: { source: "cdp_loader_id"; token: string };
  inventory: z.output<typeof postAcceptFormInventorySchema>;
};
export type PostAcceptFormSnapshotCapture = PostAcceptFormSnapshotCommon & (
  | { contractVersion: "certscore.post_accept_form_snapshots.v1"; lateForm?: never }
  | { contractVersion: "certscore.post_accept_form_snapshots.v2"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 1500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v3"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 5500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v4"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v5"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    }; postCaptureInventory: PostCaptureInventory }
  | { contractVersion: "certscore.post_accept_form_snapshots.v6"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    }; postCaptureInventory: PostCaptureInventory;
    postCaptureSnapshots: { capturedAtMs: number; snapshots: CollectionSurfaceSnapshot[] } }
);
type PostAcceptFormSnapshotProjectionCommon = Omit<PostAcceptFormSnapshotCommon, "snapshots"> & {
  snapshots: Array<Omit<CollectionSurfaceSnapshot, "data">>;
};
export type PostAcceptFormSnapshotProjection = PostAcceptFormSnapshotProjectionCommon & (
  | { contractVersion: "certscore.post_accept_form_snapshots.v1"; lateForm?: never }
  | { contractVersion: "certscore.post_accept_form_snapshots.v2"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 1500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v3"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 5500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v4"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    } }
  | { contractVersion: "certscore.post_accept_form_snapshots.v5"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    }; postCaptureInventory: PostCaptureInventory }
  | { contractVersion: "certscore.post_accept_form_snapshots.v6"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 9500;
    }; postCaptureInventory: PostCaptureInventory;
    postCaptureSnapshots: { capturedAtMs: number; snapshots: Array<Omit<CollectionSurfaceSnapshot, "data">> } }
);
// Packet pixels and persisted metadata share the same provenance contract.
const common = {
  phase: z.literal("after_accept"),
  sessionId: z.string().uuid(),
  exactTargetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  acceptanceRegisteredAtMs: z.number().int().nonnegative(),
  capturedAtMs: z.number().int().nonnegative(),
  documentIdentity: z.object({ source: z.literal("cdp_loader_id"), token: z.string().min(1).max(128) }).strict(),
  inventory: postAcceptFormInventorySchema,
};
const lateFormSchema = z.object({
  baseCaptureDeadlineAtMs: z.number().int().nonnegative(),
  detectedAtMs: z.number().int().nonnegative(),
  extensionMs: z.literal(1500),
}).strict();
const extendedLateFormSchema = lateFormSchema.extend({ extensionMs: z.literal(5500) });
const finalLateFormSchema = lateFormSchema.extend({ extensionMs: z.literal(9500) });
const postCaptureInventorySchema = z.object({
  capturedAtMs: z.number().int().nonnegative(),
  documentIdentity: common.documentIdentity,
  inventory: postAcceptFormInventorySchema,
}).strict();
/** A later DOM inventory may enrich a row only when its original imaged
 * controls still identify the same form in the same order and document. */
export function postAcceptImageInventoryMatchesLaterInventory(
  original: z.output<typeof postAcceptFormInventorySchema>,
  later: z.output<typeof postAcceptFormInventorySchema>,
) {
  if (original.pageUrl !== later.pageUrl || later.forms.length < original.forms.length) return false;
  return original.forms.every(form => {
    const candidate = later.forms.find(item => item.formRef === form.formRef);
    return candidate?.structure === form.structure && candidate.method === form.method &&
      candidate.actionHostname === form.actionHostname && candidate.fields.length >= form.fields.length &&
      form.fields.every(field => candidate.fields.some(item =>
        item.controlIndex === field.controlIndex && item.elementType === field.elementType &&
        item.inputType === field.inputType && item.label === field.label));
  });
}
function validateBinding(value: PostAcceptFormSnapshotProjection, ctx: z.RefinementCtx) {
  if (value.actionDispatchedAtMs > value.acceptanceRegisteredAtMs || value.acceptanceRegisteredAtMs > value.capturedAtMs ||
    value.inventory.forms.length > 2 || value.inventory.forms.length === 0 ||
    value.inventory.forms.some(form => form.pageUrl !== value.inventory.pageUrl) ||
    new Set(value.inventory.forms.map(form => form.formRef)).size !== value.inventory.forms.length ||
    value.snapshots.some(snapshot =>
      (snapshot.status === "available" && (!snapshot.sha256 || !snapshot.sizeBytes || !snapshot.width || !snapshot.height || snapshot.reason)) ||
      (snapshot.reason !== undefined && (snapshot.status === "withheld") !== (snapshot.reason === "review_withheld")) ||
      snapshot.pageUrl !== value.inventory.pageUrl ||
      !value.inventory.forms.some(form => form.formRef === snapshot.formRef)) ||
    new Set(value.snapshots.map(snapshot => snapshot.formRef)).size !== value.snapshots.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "After-Accept form images require bounded registered inventory binding" });
  }
  if (value.contractVersion !== "certscore.post_accept_form_snapshots.v1" &&
    (value.lateForm.baseCaptureDeadlineAtMs < value.acceptanceRegisteredAtMs ||
      value.lateForm.detectedAtMs < value.acceptanceRegisteredAtMs + (value.contractVersion === "certscore.post_accept_form_snapshots.v2" ? 1500 : 1000) ||
      value.lateForm.detectedAtMs < value.lateForm.baseCaptureDeadlineAtMs - (value.contractVersion === "certscore.post_accept_form_snapshots.v2" ? 1500 : 2000) ||
      value.lateForm.detectedAtMs > value.lateForm.baseCaptureDeadlineAtMs ||
      value.capturedAtMs < value.lateForm.detectedAtMs ||
      value.capturedAtMs > value.lateForm.baseCaptureDeadlineAtMs + value.lateForm.extensionMs)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Extended form pixels require a late detected form and bounded capture time" });
  }
  if ((value.contractVersion === "certscore.post_accept_form_snapshots.v5" || value.contractVersion === "certscore.post_accept_form_snapshots.v6") &&
    (value.postCaptureInventory.capturedAtMs < value.capturedAtMs ||
      value.postCaptureInventory.capturedAtMs > value.lateForm.baseCaptureDeadlineAtMs + value.lateForm.extensionMs ||
      value.postCaptureInventory.documentIdentity.token !== value.documentIdentity.token ||
      !postAcceptImageInventoryMatchesLaterInventory(value.inventory, value.postCaptureInventory.inventory))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Later form inventory must match the imaged document and retained controls" });
  }
  if (value.contractVersion === "certscore.post_accept_form_snapshots.v6") {
    const extra = value.postCaptureSnapshots;
    if (extra.capturedAtMs < value.postCaptureInventory.capturedAtMs ||
      extra.capturedAtMs > value.lateForm.baseCaptureDeadlineAtMs + value.lateForm.extensionMs ||
      extra.snapshots.length + value.snapshots.length > 2 ||
      new Set(extra.snapshots.map(snapshot => snapshot.formRef)).size !== extra.snapshots.length ||
      extra.snapshots.some(snapshot =>
        value.inventory.forms.some(form => form.formRef === snapshot.formRef) ||
        !value.postCaptureInventory.inventory.forms.some(form => form.formRef === snapshot.formRef) ||
        snapshot.pageUrl !== value.inventory.pageUrl ||
        (snapshot.status === "available" && (!snapshot.sha256 || !snapshot.sizeBytes || !snapshot.width || !snapshot.height || snapshot.reason)) ||
        (snapshot.reason !== undefined && (snapshot.status === "withheld") !== (snapshot.reason === "review_withheld")))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Later form images require their own bounded inventory binding and a two-image total" });
    }
  }
}
const captureCommon = { ...common, snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotSchema)).max(2) };
const projectionCommon = { ...common, snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotMetadataSchema)).max(2) };
export const postAcceptFormSnapshotCaptureSchema: z.ZodType<PostAcceptFormSnapshotCapture, z.ZodTypeDef, unknown> = z.union([
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v1") }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v2"), lateForm: lateFormSchema }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v3"), lateForm: extendedLateFormSchema }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v4"), lateForm: finalLateFormSchema }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v5"), lateForm: finalLateFormSchema, postCaptureInventory: postCaptureInventorySchema }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v6"), lateForm: finalLateFormSchema,
    postCaptureInventory: postCaptureInventorySchema, postCaptureSnapshots: z.object({
      capturedAtMs: z.number().int().nonnegative(), snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotSchema)).min(1).max(1),
    }).strict() }).strict(),
]).superRefine(validateBinding);
export const postAcceptFormSnapshotProjectionSchema: z.ZodType<PostAcceptFormSnapshotProjection, z.ZodTypeDef, unknown> = z.union([
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v1") }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v2"), lateForm: lateFormSchema }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v3"), lateForm: extendedLateFormSchema }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v4"), lateForm: finalLateFormSchema }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v5"), lateForm: finalLateFormSchema, postCaptureInventory: postCaptureInventorySchema }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v6"), lateForm: finalLateFormSchema,
    postCaptureInventory: postCaptureInventorySchema, postCaptureSnapshots: z.object({
      capturedAtMs: z.number().int().nonnegative(), snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotMetadataSchema)).min(1).max(1),
    }).strict() }).strict(),
]).superRefine(validateBinding);
