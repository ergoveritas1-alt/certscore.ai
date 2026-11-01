import { z } from "zod";

const count = z.number().int().min(0).max(8);
const observationCounts = z.object({
  retained: count, available: count, unavailable: count, limited: count, valueProof: count,
}).strict().refine(value => value.available + value.unavailable === value.retained &&
  value.limited <= value.retained && value.valueProof <= value.available,
"Availability counts must describe the same retained observations.");
const phase = z.object({ receipts: observationCounts, configuration: observationCounts }).strict();

type ReceiptObservationCounts = {retained: number; available: number; unavailable: number; limited: number; valueProof: number};
type ReceiptAvailabilityPhase = {receipts: ReceiptObservationCounts; configuration: ReceiptObservationCounts};
/** Named boundary keeps API/MCP declaration generation from expanding every phase schema. */
export type ApiV2ConsentReceiptAvailability = {
  policyVersion: "consent_receipt_availability.v1"; diagnosticOnly: true;
  sourcePacketSha256: string; action: "accept" | "reject"; coverage: "retained_observations_only";
  documentStable: boolean; cancelled: boolean; observationsTruncated: boolean; processingLimited: boolean;
  phases: {baseline: ReceiptAvailabilityPhase; initial: ReceiptAvailabilityPhase; terminal: ReceiptAvailabilityPhase};
};

/** Counts of retained diagnostic rows only: zero rows never establishes a read
 * or receipt absence. No receipt identities, values, facts or decisions escape. */
export const apiV2ConsentReceiptAvailabilitySchema: z.ZodType<ApiV2ConsentReceiptAvailability> = z.object({
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

const countsOpenApi = {
  type: "object", additionalProperties: false,
  required: ["retained", "available", "unavailable", "limited", "valueProof"],
  properties: Object.fromEntries(["retained", "available", "unavailable", "limited", "valueProof"]
    .map(name => [name, {type: "integer", minimum: 0, maximum: 8}])),
} as const;
const phaseOpenApi = {type: "object", additionalProperties: false,
  required: ["receipts", "configuration"], properties: {receipts: countsOpenApi, configuration: countsOpenApi}} as const;
export const receiptAvailabilityOpenApi = {
  type: ["object", "null"], additionalProperties: false,
  description: "Diagnostic counts of retained observations, capped at eight in total. Zero retained rows does not establish that a phase was read or a receipt absent; null means no source-bound capture was retained. Available plus unavailable equals retained. Limited/value-proof counts never verify a decision. Configuration inputs stay separate from receipts.",
  required: ["policyVersion", "diagnosticOnly", "sourcePacketSha256", "action", "coverage", "documentStable", "cancelled", "observationsTruncated", "processingLimited", "phases"],
  properties: {
    policyVersion: {type: "string", const: "consent_receipt_availability.v1"},
    diagnosticOnly: {type: "boolean", const: true}, sourcePacketSha256: {type: "string", pattern: "^[a-f0-9]{64}$"},
    action: {type: "string", enum: ["accept", "reject"]}, coverage: {type: "string", const: "retained_observations_only"},
    documentStable: {type: "boolean"}, cancelled: {type: "boolean"},
    observationsTruncated: {type: "boolean"}, processingLimited: {type: "boolean"},
    phases: {type: "object", additionalProperties: false, required: ["baseline", "initial", "terminal"],
      properties: {baseline: phaseOpenApi, initial: phaseOpenApi, terminal: phaseOpenApi}},
  },
} as const;
