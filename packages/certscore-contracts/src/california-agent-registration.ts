import { z } from "zod";
import type { CaliforniaPolicyDocument } from "./california-clause-assessment";
import { californiaRestrictionShadowSchema } from "./california-restriction-shadow";

export const CALIFORNIA_AGENT_REGISTRATION_ID = "california_agent_registration_required";
export const CALIFORNIA_AGENT_REGISTRATION_POLICY = "california.agent-registration.v1";
export const CALIFORNIA_AGENT_REGISTRATION_BYTES = 2_048;
const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** Positive source-bound clause only. Missing/limited analysis is not an absence
 * assessment. The parent review independently joins this document and bundle. */
export const californiaAgentRegistrationSchema = z.object({
  policyVersion: z.literal(CALIFORNIA_AGENT_REGISTRATION_POLICY),
  scanId: z.string().min(1).max(200), sourceBundleSha256: hash,
  evidenceRef: z.string().min(1).max(240), textSha256: hash,
  sourceDocumentUrl: z.string().url().max(800).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }),
  scope: z.literal("authorized_agent"),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  contextStart: z.number().int().nonnegative(), contextEnd: z.number().int().positive(),
  documentChars: z.number().int().min(1).max(160_000),
  excerpt: z.string().min(1).max(600),
}).strict().superRefine((row, ctx) => {
  if (row.end - row.start !== row.excerpt.length || row.contextStart > row.start ||
      row.contextEnd < row.end || row.contextEnd > row.documentChars ||
      row.contextEnd - row.contextStart > 8_000)
    ctx.addIssue({ code: "custom", message: "Registration clause requires bounded, exact source ranges." });
  if (new TextEncoder().encode(JSON.stringify(row)).byteLength > CALIFORNIA_AGENT_REGISTRATION_BYTES)
    ctx.addIssue({ code: "custom", message: "Registration assessment exceeds its inclusive UTF-8 cap." });
});
export type CaliforniaAgentRegistration = z.infer<typeof californiaAgentRegistrationSchema>;

/** Compact canonical finding detail; the complete parent remains retained once
 * and is independently rejoined by concern policy and the score aggregator. */
export const californiaAgentRegistrationProjectionSchema = z.object({
  assessment: californiaAgentRegistrationSchema,
  documentUrl: z.string().url().max(800).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }),
}).strict().refine(row => new TextEncoder().encode(JSON.stringify(row)).byteLength <= 3_072,
  "Registration finding detail exceeds its inclusive UTF-8 cap.");
export type CaliforniaAgentRegistrationProjection = z.infer<typeof californiaAgentRegistrationProjectionSchema>;

/** Consume the one existing bounded analysis; never rerun it or fetch sources. */
export function materializeCaliforniaAgentRegistration(
  analysis: unknown, documents: CaliforniaPolicyDocument[], scanId: string, sourceBundleSha256: string,
): CaliforniaAgentRegistration | undefined {
  const parsed = californiaRestrictionShadowSchema.safeParse(analysis);
  if (!parsed.success || parsed.data.status !== "evaluated" || parsed.data.sourceBundleSha256 !== sourceBundleSha256) return;
  const candidate = parsed.data.candidates.find(row => row.kind === "agent_registration" && row.scope === "authorized_agent");
  if (!candidate) return;
  const document = documents.find(row => row.evidenceRef === candidate.evidenceRef && row.textSha256 === candidate.textSha256);
  if (!document) return;
  // Additional conservative scoring exclusions, over the same bounded context.
  // Preserve the research matcher and source gates; direct alternative-agent
  // wording cannot support a mandatory registration deduction.
  const context = document.text.slice(candidate.contextStart, candidate.contextEnd);
  if (/\b(?:an?|any) unregistered (?:natural person|individual|agent)\b[^.!?\n]{0,120}\b(?:may|can) (?:also )?(?:act|serve)\b/i.test(context) ||
      /\byou may (?:instead |also )?(?:appoint|authorize|use) (?:an?|any) (?:natural person|individual|agent)\b[^.!?\n]{0,120}\b(?:not registered|unregistered|without (?:state )?registration)\b/i.test(context)) return;
  const { kind: _kind, ...passage } = candidate;
  const result = californiaAgentRegistrationSchema.safeParse({
    policyVersion: CALIFORNIA_AGENT_REGISTRATION_POLICY, scanId, sourceBundleSha256,
    ...passage, sourceDocumentUrl: document.url, documentChars: document.text.length,
    excerpt: document.text.slice(candidate.start, candidate.end),
  });
  return result.success ? result.data : undefined;
}
