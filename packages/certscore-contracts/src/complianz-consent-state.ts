import { z } from "zod";

export const COMPLIANZ_OPTIONAL_CATEGORIES = ["preferences", "statistics", "marketing"] as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative();
/** Fixed complete-category protocol, not an interpretation of one category or
 * banner dismissal. TCF and service-specific overrides are unsupported here. */
export const complianzConfigurationSchema = z.object({
  prefix: z.literal("cmplz_"), tcfActive: z.literal(false),
  categories: z.array(z.enum(["functional", ...COMPLIANZ_OPTIONAL_CATEGORIES])).length(4)
    .refine(values => new Set(values).size === 4),
}).strict();
export const complianzReceiptEvidenceSchema = z.object({
  policyVersion: z.literal("complianz_complete_categories.v1"),
  writeBinding: z.literal("exact_document_cookie_assignment"),
  configuration: complianzConfigurationSchema,
  documentSha256: hash, cookieScopeSha256: hash, stateSha256: hash,
  readAtEpochMs: time,
  categories: z.array(z.object({
    category: z.enum(COMPLIANZ_OPTIONAL_CATEGORIES), value: z.enum(["allow", "deny"]),
    identitySha256: hash, valueSha256: hash, writtenAtEpochMs: time,
  }).strict()).length(3),
  functional: z.object({ value: z.literal("allow"), identitySha256: hash }).strict(),
  services: z.object({ value: z.literal(""), identitySha256: hash }).strict(),
}).strict().superRefine((proof, ctx) => {
  if (new Set(proof.categories.map(row => row.category)).size !== 3 ||
    new Set([...proof.categories.map(row => row.identitySha256), proof.functional.identitySha256, proof.services.identitySha256]).size !== 5 ||
    proof.categories.some(row => row.writtenAtEpochMs > proof.readAtEpochMs || row.valueSha256 !==
      (row.value === "allow" ? "410083735735a10e658a19edd1704e606c9dd112e225825b63fafeded766c8b9" :
        "3026a0ca485e5831657ba0120fa8dd66b3425427bfb0a2be0db743e2305cc7c5"))) {
    ctx.addIssue({code:z.ZodIssueCode.custom, message:"Complianz requires complete distinct category receipts and bounded fresh writes."});
  }
});
export type ComplianzReceiptEvidence = z.infer<typeof complianzReceiptEvidenceSchema>;
export function complianzReceiptDecision(proof: ComplianzReceiptEvidence) {
  return proof.categories.every(row => row.value === "allow") ? "granted" as const
    : proof.categories.every(row => row.value === "deny") ? "denied" as const : "mixed" as const;
}
export function validateComplianzReceiptEnvelope(proof: ComplianzReceiptEvidence | undefined,
  envelope: {startedAt:string; completedAt:string; dispatchedAtMs?:number; observedAtMs?:number; frameIdentitySha256?:string; cmpId?:string}, ctx:z.RefinementCtx) {
  if (!proof) return;
  const start = Date.parse(envelope.startedAt), end = Date.parse(envelope.completedAt);
  const click = envelope.dispatchedAtMs === undefined ? NaN : start + envelope.dispatchedAtMs;
  const latestWrite = Math.max(...proof.categories.map(row => row.writtenAtEpochMs));
  if (envelope.cmpId !== "Complianz" || !Number.isFinite(click) || proof.documentSha256 !== envelope.frameIdentitySha256 ||
    proof.categories.some(row => row.writtenAtEpochMs < click) || proof.readAtEpochMs > end ||
    envelope.observedAtMs === undefined || latestWrite !== start + envelope.observedAtMs) {
    ctx.addIssue({code:z.ZodIssueCode.custom, path:["decisionEvidence"],
      message:"Complianz receipts must bind to this document, dispatched action and exact fresh decision timestamp."});
  }
}
