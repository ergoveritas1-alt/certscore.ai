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
export type PostAcceptFormSnapshotCapture = PostAcceptFormSnapshotCommon & (
  | { contractVersion: "certscore.post_accept_form_snapshots.v1"; lateForm?: never }
  | { contractVersion: "certscore.post_accept_form_snapshots.v2"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 1500;
    } }
);
type PostAcceptFormSnapshotProjectionCommon = Omit<PostAcceptFormSnapshotCommon, "snapshots"> & {
  snapshots: Array<Omit<CollectionSurfaceSnapshot, "data">>;
};
export type PostAcceptFormSnapshotProjection = PostAcceptFormSnapshotProjectionCommon & (
  | { contractVersion: "certscore.post_accept_form_snapshots.v1"; lateForm?: never }
  | { contractVersion: "certscore.post_accept_form_snapshots.v2"; lateForm: {
      baseCaptureDeadlineAtMs: number; detectedAtMs: number; extensionMs: 1500;
    } }
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
  if (value.contractVersion === "certscore.post_accept_form_snapshots.v2" &&
    (value.lateForm.baseCaptureDeadlineAtMs < value.acceptanceRegisteredAtMs ||
      value.lateForm.detectedAtMs < value.acceptanceRegisteredAtMs + 1800 ||
      value.lateForm.detectedAtMs < value.lateForm.baseCaptureDeadlineAtMs - 1200 ||
      value.lateForm.detectedAtMs > value.lateForm.baseCaptureDeadlineAtMs ||
      value.capturedAtMs < value.lateForm.detectedAtMs ||
      value.capturedAtMs > value.lateForm.baseCaptureDeadlineAtMs + value.lateForm.extensionMs)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Extended form pixels require a late detected form and bounded capture time" });
  }
}
const captureCommon = { ...common, snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotSchema)).max(2) };
const projectionCommon = { ...common, snapshots: z.array(z.lazy(() => collectionSurfaceSnapshotMetadataSchema)).max(2) };
export const postAcceptFormSnapshotCaptureSchema: z.ZodType<PostAcceptFormSnapshotCapture, z.ZodTypeDef, unknown> = z.union([
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v1") }).strict(),
  z.object({ ...captureCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v2"), lateForm: lateFormSchema }).strict(),
]).superRefine(validateBinding);
export const postAcceptFormSnapshotProjectionSchema: z.ZodType<PostAcceptFormSnapshotProjection, z.ZodTypeDef, unknown> = z.union([
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v1") }).strict(),
  z.object({ ...projectionCommon, contractVersion: z.literal("certscore.post_accept_form_snapshots.v2"), lateForm: lateFormSchema }).strict(),
]).superRefine(validateBinding);
