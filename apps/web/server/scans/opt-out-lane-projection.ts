import { createHash } from "node:crypto";
import { optOutPreActionStopSchema, saleSharingOptOutLaneOutcomeSchema, verifiedSaleSharingOptOutSchema } from "@certscore/contracts";
import type { CanonicalEvidenceBundle, SaleSharingOptOutLaneOutcome } from "@certscore/contracts";

type LaneBundle = Pick<CanonicalEvidenceBundle, "scanId" | "normalizedUrl" | "completedAt" |
  "saleSharingOptOut" | "saleSharingOptOutLaneOutcome">;

/** The caller verifies the original coordinator bundle and its scan identity. */
export function projectOptOutLaneOutcome(bundle: LaneBundle): SaleSharingOptOutLaneOutcome | undefined {
  const lane = saleSharingOptOutLaneOutcomeSchema.safeParse(bundle.saleSharingOptOutLaneOutcome).data;
  if (!lane || Date.parse(lane.startedAt) > Date.parse(lane.completedAt)) return undefined;
  const { status, startedAt, completedAt, limitationCode } = lane;
  const projection = { status, startedAt, completedAt, ...(limitationCode ? { limitationCode } : {}) };
  if (status !== "joined") return projection;

  const original = bundle.saleSharingOptOut;
  const verified = verifiedSaleSharingOptOutSchema.safeParse(original).data;
  if (!original || !verified) return projection;
  const packet = verified.evidence;
  // A failed navigation needs the dispatch target, not a claim about the
  // page visited by the main scanner. Accept only an explicit pre-action stop.
  const stop = optOutPreActionStopSchema.safeParse(packet.limitations[0]).data;
  if (!stop || packet.limitations.length !== 1 || packet.status !== "limited" ||
    packet.scanId !== bundle.scanId || packet.targetUrl !== bundle.normalizedUrl ||
    Date.parse(packet.startedAt) < Date.parse(lane.startedAt) ||
    Date.parse(packet.completedAt) > Date.parse(lane.completedAt) ||
    Date.parse(packet.completedAt) > Date.parse(bundle.completedAt) ||
    packet.actionCount !== 0 || packet.submitted || packet.registration !== "not_attempted" ||
    packet.documentToken || packet.before || packet.after || packet.redHatChoice?.clickAtMs != null || packet.captureComplete ||
    packet.observationWindowMs !== 0 || packet.requests.length) return projection;
  const bytes = Buffer.from(JSON.stringify(original.evidence));
  if (bytes.length !== verified.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== verified.sha256) return projection;
  return { ...projection, preActionStop: stop };
}
