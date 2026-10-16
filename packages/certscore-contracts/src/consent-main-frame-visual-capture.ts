import { z } from "zod";
import { verifyConsentControlInspection, isRelevantConsentInspectionCandidate } from "./consent-control-inspection";

/** Positive main-document comparison scope only. Does not complete the global
 * inventory, establish absence, authorize clicks, or approve image display. */
export const consentMainFrameVisualCaptureSchema = z.object({
  version: z.literal("consent_main_frame_visual_capture.v1"),
  documentToken: z.string().min(1).max(160), pageUrl: z.string().url(), capturedAt: z.string().datetime(),
  screenshotArtifactRef: z.string().min(1).max(500),
  frameRevisionBeforeImage: z.number().int().nonnegative(), frameRevisionAtMainRead: z.number().int().nonnegative(),
  inventoryComplete: z.literal(true),
  candidateIds: z.array(z.string().min(1).max(160)).max(160),
}).strict().refine(p => p.frameRevisionBeforeImage === p.frameRevisionAtMainRead &&
  new Set(p.candidateIds).size === p.candidateIds.length, "Main-page pixels require a stable, complete main-frame capture");
export type ConsentMainFrameVisualCapture = z.infer<typeof consentMainFrameVisualCaptureSchema>;

export function verifiedMainFrameVisualCapture(geometry: unknown): ConsentMainFrameVisualCapture | undefined {
  if (!geometry || typeof geometry !== "object") return undefined;
  const g = geometry as Record<string, any>, parsed = consentMainFrameVisualCaptureSchema.safeParse(g.mainFrameVisualCapture);
  if (!parsed.success || g.documentIdentity?.source !== "cdp_loader_id" || parsed.data.documentToken !== g.documentIdentity.token ||
      parsed.data.pageUrl !== g.pageUrl || parsed.data.capturedAt !== g.capturedAt || parsed.data.screenshotArtifactRef !== g.screenshotArtifactRef ||
      g.captureTiming?.version !== "consent_geometry_capture_timing.v1" || g.captureTiming.mainFrameCompletedAt !== g.capturedAt ||
      !Number.isFinite(Date.parse(g.captureTiming.completedAt)) || Date.parse(g.captureTiming.completedAt) < Date.parse(g.capturedAt) ||
      !Array.isArray(g.candidates)) return undefined;
  const inspection = verifyConsentControlInspection(g.controlInspection, g.candidates);
  if (!inspection || inspection.version !== "control_specific_inspection.v3") return undefined;
  const main = g.candidates.filter((c: any) => c.frameContext?.frameKind === "main_frame");
  if (main.length !== parsed.data.candidateIds.length || main.some((c: any) => c.frameContext.frameUrl !== g.pageUrl || !parsed.data.candidateIds.includes(c.candidateId))) return undefined;
  const relevant = main.filter((c: any) => isRelevantConsentInspectionCandidate(c, inspection.version));
  if (relevant.some((c: any) => inspection.candidates.find(row => row.candidateId === c.candidateId)?.unresolvedIntents.some(intent => intent === "accept" || intent === "reject"))) return undefined;
  if (["accept_all", "reject_all"].some(action => relevant.filter((c: any) => c.actionType === action && c.decisionStatus === "confirmed_visible").length !== 1)) return undefined;
  return parsed.data;
}
