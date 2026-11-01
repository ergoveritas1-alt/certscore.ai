import { z } from "zod";
import { consentReceiptCaptureSchema, type ConsentReceiptCapture } from "./consent-receipt-capture";

const count = z.number().int().min(0).max(8);
const observationCounts = z.object({
  retained: count, available: count, unavailable: count, limited: count, valueProof: count,
}).strict().refine(value => value.available + value.unavailable === value.retained &&
  value.limited <= value.retained && value.valueProof <= value.available,
"Availability counts must describe the same retained observations.");
const phase = z.object({ receipts: observationCounts, configuration: observationCounts }).strict();

/** Counts of retained diagnostic rows only: zero rows never establishes a read
 * or receipt absence. No receipt identities, values, facts or decisions escape. */
export const consentReceiptAvailabilitySchema = z.object({
  policyVersion: z.literal("consent_receipt_availability.v1"), diagnosticOnly: z.literal(true),
  sourcePacketSha256: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["accept", "reject"]),
  coverage: z.literal("retained_observations_only"),
  documentStable: z.boolean(), cancelled: z.boolean(),
  observationsTruncated: z.boolean(), processingLimited: z.boolean(),
  phases: z.object({ baseline: phase, initial: phase, terminal: phase }).strict(),
}).strict().refine(value => {
  const rows = Object.values(value.phases).reduce((total, p) => total + p.receipts.retained + p.configuration.retained, 0);
  return rows <= 8 && ((value.documentStable && !value.cancelled) || rows === 0);
}, "Summary must preserve the original observation cap and invalidation.");
export type ConsentReceiptAvailability = z.infer<typeof consentReceiptAvailabilitySchema>;

export function summarizeConsentReceiptAvailability(capture: ConsentReceiptCapture | undefined, sourcePacketSha256?: string): ConsentReceiptAvailability | undefined {
  if (!capture || !sourcePacketSha256) return undefined;
  const source = consentReceiptCaptureSchema.parse(capture);
  const empty = () => ({ retained: 0, available: 0, unavailable: 0, limited: 0, valueProof: 0 });
  const emptyPhase = () => ({ receipts: empty(), configuration: empty() });
  const phases = { baseline: emptyPhase(), initial: emptyPhase(), terminal: emptyPhase() };
  for (const observation of source.observations) {
    const counts = phases[observation.phase][observation.source === "configuration" ? "configuration" : "receipts"];
    counts.retained++;
    counts[observation.available ? "available" : "unavailable"]++;
    if (observation.factsLimited) counts.limited++;
    if (observation.valueSha256) counts.valueProof++;
  }
  return consentReceiptAvailabilitySchema.parse({
    policyVersion: "consent_receipt_availability.v1", diagnosticOnly: true, sourcePacketSha256,
    action: source.action, coverage: "retained_observations_only", documentStable: source.documentStable,
    cancelled: source.cancelled, observationsTruncated: source.observationsTruncated,
    processingLimited: source.processingLimited, phases,
  });
}
