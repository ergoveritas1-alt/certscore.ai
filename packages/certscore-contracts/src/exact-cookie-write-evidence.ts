import { z } from "zod";

/** An exact observed assignment/header is not independent browser-acceptance proof. */
export const exactCookieWriteEvidenceSchema = z.object({
  policyVersion: z.literal("exact_cookie_write_evidence.v1"),
  source: z.enum(["main_document_setter", "response_set_cookie"]),
  acceptance: z.literal("not_independently_verified"),
  name: z.string().min(1).max(180), hostname: z.string().min(1).max(255),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/), valueHash: z.string().regex(/^[a-f0-9]{64}$/),
  observedAtMs: z.number().int().nonnegative(),
}).strict();
export type ExactCookieWriteEvidence = z.infer<typeof exactCookieWriteEvidenceSchema>;
