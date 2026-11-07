import { z } from "zod";

/** The first blocker observed by the verified coordinator or report projector.
 * A reason is coverage metadata, never a substitute for a paired state. */
export const GPC_CMP_PAIR_BLOCKERS = [
  "worker_source_unverified",
  "capture_ineligible",
  "paired_document_unverified",
  "gpc_session_unverified",
  "gpc_checkpoint_unavailable",
  "gpc_cmp_not_ready",
  "gpc_state_unverified",
  "baseline_checkpoint_missing",
  "baseline_checkpoint_unavailable",
  "baseline_cmp_not_ready",
  "baseline_state_unverified",
  "section_mismatch",
  "comparison_window_unverified",
  "report_binding_rejected",
] as const;

export const gpcCmpPairBlockerSchema = z.enum(GPC_CMP_PAIR_BLOCKERS);
export type GpcCmpPairBlocker = z.infer<typeof gpcCmpPairBlockerSchema>;
