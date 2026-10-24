import { z } from "zod";

export const PRIVACY_CHOICE_DIAGNOSTIC_BYTES = 4096;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const state = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const identity = z.enum(["same", "different", "unavailable"]);
export const privacyFrameCheckpointIdentitySchema = z.object({
  version: z.literal("privacy_frame_checkpoint_identity.v1"),
  scope: z.literal("sampled_frame_checkpoint_identity_only"),
  identityBasis: z.literal("dom_reference_equality"),
  status: z.enum(["matched", "limited"]),
  parentDocument: identity,
  frames: z.array(z.object({slot: z.number().int().min(0).max(3), node: identity, document: identity}).strict()).max(4),
  limitations: z.array(z.enum(["frame_limit", "time_limit", "read_unavailable", "parent_changed", "frame_set_changed",
    "duplicate_frame", "node_changed", "document_changed", "cancelled", "checkpoint_missing"])).max(10),
}).strict().superRefine((value, ctx) => {
  const invalid = (message: string) => ctx.addIssue({code: "custom", message});
  if ((value.status === "limited") !== Boolean(value.limitations.length)) invalid("Identity limitations must stay explicit.");
  if (value.frames.some((row, index) => row.slot !== index)) invalid("Identity slots must be ordered and unique.");
  if (value.status === "matched" && (value.parentDocument !== "same" || !value.frames.length ||
      value.frames.some(row => row.node !== "same" || row.document !== "same"))) invalid("Matched identity requires exact endpoint references.");
  if (value.parentDocument === "different" && !value.limitations.includes("parent_changed")) invalid("Parent replacement must stay explicit.");
  if (value.frames.some(row => row.node === "different") && !value.limitations.includes("node_changed")) invalid("Node replacement must stay explicit.");
  if (value.frames.some(row => row.document === "different") && !value.limitations.includes("document_changed")) invalid("Document replacement must stay explicit.");
  if (value.frames.some(row => row.document !== "unavailable" && (row.node !== "same" || value.parentDocument !== "same")))
    invalid("Child identity requires the same frame and parent.");
});
const frameRead = z.object({
  locatorHash: hash,
  frameDocumentHash: hash.nullable(),
  reason: z.enum(["visible", "display_none", "visibility_hidden", "visibility_collapse", "opacity_zero", "aria_hidden", "inert", "no_rect", "style_unavailable", "ancestor_limit", "time_limit"]),
  depth: z.number().int().min(0).max(16),
  locatorLimited: z.boolean(),
}).strict();
/** Diagnostics only: structural identity is never same-node continuity proof. */
export const privacyChoiceDiagnosticsSchema = z.object({
  version: z.literal("privacy_choice_diagnostics.v1"),
  inspectionSourceHash: hash,
  firstDocumentHash: hash,
  secondDocumentHash: hash.nullable(),
  identityBasis: z.literal("document_and_structural_locator_only"),
  status: z.enum(["captured", "limited"]),
  limitations: z.array(z.enum(["unnamed_sample_truncated", "frame_sample_truncated", "diagnostic_time_limit", "locator_limited", "second_checkpoint_unavailable", "document_changed", "frame_set_changed", "byte_limit", "diagnostic_unavailable", "frame_document_changed", "frame_state_changed"])).max(11),
  unnamedControls: z.array(z.object({
    locatorHash: hash,
    locatorLimited: z.boolean(),
    scope: z.enum(["main", "frame"]),
    tag: z.enum(["a", "button", "other"]),
    role: z.enum(["button", "link", "none", "other"]),
    // aria-label, aria-labelledby, text, image-alt, SVG-title, title:
    // 0 = no returned value, 1 = empty returned value, 2 = non-empty.
    nameStates: z.tuple([state, state, state, state, state, state]),
    labelledByTruncated: z.boolean(),
  }).strict()).max(8),
  frames: z.array(z.object({ first: frameRead, second: frameRead.nullable() }).strict()).max(4),
  // Optional, separately versioned proof; old structural-only records retain
  // their meaning. Only the separately versioned v6 inspection exclusion may
  // use this proof for absence; diagnostics alone never establish it.
  checkpointIdentity: privacyFrameCheckpointIdentitySchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).length > PRIVACY_CHOICE_DIAGNOSTIC_BYTES)
    ctx.addIssue({code:"custom",message:"Choice diagnostics exceed the shared 4 KiB cap."});
  if ((value.limitations.length > 0) !== (value.status === "limited"))
    ctx.addIssue({code:"custom",message:"Diagnostic limitations must stay explicit."});
  if (value.firstDocumentHash !== value.secondDocumentHash && !value.limitations.includes(value.secondDocumentHash === null ? "second_checkpoint_unavailable" : "document_changed"))
    ctx.addIssue({code:"custom",message:"Checkpoint document mismatch must stay explicit."});
  const reads = value.frames.flatMap(row => row.second ? [row.first, row.second] : [row.first]);
  if ((value.unnamedControls.some(row => row.locatorLimited) || reads.some(row => row.locatorLimited || row.reason === "ancestor_limit")) && !value.limitations.includes("locator_limited"))
    ctx.addIssue({code:"custom",message:"Truncated locators must stay explicit."});
  if (value.frames.some(row => !row.second) && !value.limitations.includes("frame_set_changed"))
    ctx.addIssue({code:"custom",message:"Missing frame checkpoints must stay explicit."});
  if (reads.some(row => row.reason === "time_limit") && !value.limitations.includes("diagnostic_time_limit"))
    ctx.addIssue({code:"custom",message:"Diagnostic time limits must stay explicit."});
  if (reads.some(row => row.reason === "style_unavailable") && !value.limitations.includes("diagnostic_unavailable"))
    ctx.addIssue({code:"custom",message:"Unavailable frame style must stay explicit."});
  if (value.frames.some(row => row.second) && value.firstDocumentHash !== value.secondDocumentHash)
    ctx.addIssue({code:"custom",message:"Frame pairing requires a matching parent document."});
  if (value.frames.some(row => row.second && row.first.frameDocumentHash !== row.second.frameDocumentHash) && !value.limitations.includes("frame_document_changed"))
    ctx.addIssue({code:"custom",message:"Changed frame documents must stay explicit."});
  if (value.frames.some(row => row.second && (row.first.reason !== row.second.reason || row.first.depth !== row.second.depth)) && !value.limitations.includes("frame_state_changed"))
    ctx.addIssue({code:"custom",message:"Changed frame states must stay explicit."});
  if (value.frames.some(row => row.second && row.first.locatorHash !== row.second.locatorHash))
    ctx.addIssue({code:"custom",message:"Frame checkpoints must share their structural locator."});
  if (value.checkpointIdentity && value.secondDocumentHash === null)
    ctx.addIssue({code:"custom",message:"Frame identity requires the second checkpoint packet."});
});
export type PrivacyChoiceDiagnostics = z.infer<typeof privacyChoiceDiagnosticsSchema>;
