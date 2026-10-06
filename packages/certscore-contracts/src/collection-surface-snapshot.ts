import { z } from "zod";

export const collectionSurfaceSnapshotReasonSchema = z.enum([
  "capture_cancelled", "capture_budget_exhausted", "document_changed", "control_identity_unavailable",
  "control_binding_changed", "form_not_visible", "form_bounds_exceeded", "screenshot_failed",
  "image_processing_failed", "image_size_exceeded", "review_failed", "review_timed_out", "review_withheld",
]);
// Pixels are presentation evidence only; unavailable/withheld images retain no bytes.
const collectionSurfaceSnapshotObjectSchema = z.object({
  contractVersion: z.literal("certscore.collection-surface-snapshot.v1"),
  formRef: z.string().min(1).max(80),
  pageUrl: z.string().min(1).max(500),
  capturedAt: z.string().datetime(),
  status: z.enum(["available", "unavailable", "withheld"]),
  reason: collectionSurfaceSnapshotReasonSchema.optional(),
  sourceInventoryHash: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.literal("image/jpeg"),
  width: z.number().int().positive().max(640).optional(),
  height: z.number().int().positive().max(960).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sizeBytes: z.number().int().positive().max(96 * 1024).optional(),
  data: z.string().max(128 * 1024).optional(),
  valuesMasked: z.literal(true),
}).strict();
export const collectionSurfaceSnapshotMetadataSchema = collectionSurfaceSnapshotObjectSchema.omit({ data: true });
export const collectionSurfaceSnapshotSchema = collectionSurfaceSnapshotObjectSchema.superRefine((snapshot, context) => {
  if (snapshot.reason && (snapshot.status === "available" || (snapshot.status === "withheld") !== (snapshot.reason === "review_withheld"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Snapshot reason must match its status" });
  }
  if (snapshot.status === "available" ? (!snapshot.data || !snapshot.sha256 || !snapshot.sizeBytes || !snapshot.width || !snapshot.height) : snapshot.data !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Snapshot bytes require complete, approved capture metadata" });
  }
});
export type CollectionSurfaceSnapshot = z.infer<typeof collectionSurfaceSnapshotSchema>;
