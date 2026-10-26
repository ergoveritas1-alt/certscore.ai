import { z } from "zod";
import type { CaliforniaPolicyDocument } from "./california-clause-assessment";

/** Internal CertScore.ai research only. No finding, compliance or absence claim. */
export const CALIFORNIA_RESTRICTION_SHADOW_VERSION = "california.request-restriction-shadow.v1";
export const CALIFORNIA_OPT_OUT_SHADOW_VERSION = "california.request-restriction-shadow.v2";
export const CALIFORNIA_RESTRICTION_SHADOW_LIMITS = Object.freeze({
  documents: 8, documentChars: 160_000, chunkChars: 8_000, candidates: 32,
  processingMs: 10, outputBytes: 2_048,
});
const kind = z.enum(["opt_out_verification", "agent_registration", "blanket_frequency"]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidateSchema = z.object({
  kind, evidenceRef: z.string().min(1).max(240), textSha256: hash,
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  // Exact source offsets are authoritative; text is intentionally not copied.
  contextStart: z.number().int().nonnegative(), contextEnd: z.number().int().positive(),
  scope: z.enum(["stated_opt_out_route", "authorized_agent", "general_rights_requests"]),
}).strict().superRefine((row, ctx) => {
  if (row.end <= row.start || row.contextStart > row.start || row.contextEnd < row.end ||
      row.end - row.start > 600 || row.contextEnd - row.contextStart > 8_000)
    ctx.addIssue({ code: "custom", message: "Shadow ranges must bind one contiguous bounded source passage." });
});
const encoder = new TextEncoder();
export const californiaRestrictionShadowSchema = z.object({
  version: z.enum([CALIFORNIA_RESTRICTION_SHADOW_VERSION, CALIFORNIA_OPT_OUT_SHADOW_VERSION]),
  mode: z.literal("internal_shadow"), scoreEffect: z.literal("none"),
  sourceBundleSha256: hash,
  status: z.enum(["evaluated", "limited", "no_verified_sources"]),
  inspectedDocuments: z.number().int().min(0).max(8),
  inspectedChars: z.number().int().min(0).max(1_280_000),
  candidateInspections: z.number().int().min(0).max(32),
  heldCandidates: z.number().int().min(0).max(32),
  limitations: z.enum(["document_limit", "unsupported_source", "time_limit", "candidate_limit", "output_limit"]).array().max(5),
  candidates: candidateSchema.array().max(3),
}).strict().superRefine((row, ctx) => {
  if (encoder.encode(JSON.stringify(row)).byteLength > CALIFORNIA_RESTRICTION_SHADOW_LIMITS.outputBytes)
    ctx.addIssue({ code: "custom", message: "Shadow output exceeds its inclusive UTF-8 byte cap." });
  if (new Set(row.candidates.map(candidate => candidate.kind)).size !== row.candidates.length ||
      row.status === "no_verified_sources" && (row.inspectedDocuments !== 0 || row.candidates.length !== 0) ||
      row.status === "limited" && row.limitations.length === 0 ||
      row.status === "evaluated" && row.limitations.length !== 0)
    ctx.addIssue({ code: "custom", message: "Shadow coverage and bounded candidate states disagree." });
});
export type CaliforniaRestrictionShadow = z.infer<typeof californiaRestrictionShadowSchema>;
type Kind = z.infer<typeof kind>;

// Fixed bounded expressions deliberately support only narrow affirmative wording.
const anchor = /(?:registered with (?:the )?(?:California )?Secretary of State|(?:twice|two CCPA requests)[^.!?]{0,90}(?:12.month|twelve.month)|(?:confirm|verify)[^.!?]{0,150}verifiable consumer request[^.!?]{0,100}stop (?:selling|sharing))/gi;
const california = /\b(?:CCPA(?:\/CPRA)?|CPRA|California (?:residents?|consumers?|privacy|rights))\b/gi;
const otherJurisdiction = /\b(?:(?:Connecticut|Virginia|Colorado|Utah|Oregon|Texas|Montana|Delaware|Iowa|Indiana|Tennessee|New Jersey|United Kingdom|European Union|EU|EEA|UK|Canada|Canadian|Australia|Australian|Brazil|Brazilian) (?:residents?|consumers?|privacy|rights)|rights under (?:the )?GDPR|GDPR rights)\b/gi;
function lastMatch(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  let last = -1;
  for (const match of text.matchAll(pattern)) last = match.index!;
  return last;
}

function qualify(text: string, at: number, matchedLength: number) {
  const before = text.slice(Math.max(0, at - 4_000), at);
  const start = Math.max(at - 500, text.lastIndexOf(".", at) + 1, text.lastIndexOf("\n", at) + 1, 0);
  const stop = text.slice(at + matchedLength, at + 600).search(/[.!?\n]/);
  const end = stop < 0 ? Math.min(text.length, at + matchedLength) : at + matchedLength + stop + 1;
  if (end - start > 600) return null;
  const sentence = text.slice(start, end);
  const contextStart = Math.max(0, start - 4_000), contextEnd = Math.min(text.length, end + 1_500);
  const context = text.slice(contextStart, contextEnd);
  const nearby = text.slice(Math.max(0, start - 600), Math.min(text.length, end + 900));
  const scopeText = before + sentence.replace(/California Secretary of State/gi, "state register");
  const ca = lastMatch(scopeText, california);
  if (ca < 0 || lastMatch(scopeText, otherJurisdiction) > ca ||
      /\b(?:for example|sample|example|previously|formerly|historically|used to require|if|unless|except|would|could)\b/i.test(sentence)) return null;
  if (/\b(?:previous|former|historical|old) (?:privacy )?policy\b/i.test(nearby)) return null;

  let family: Kind | undefined;
  let scope: z.infer<typeof candidateSchema>["scope"] | undefined;
  if (/registered with (?:the )?(?:California )?Secretary of State/i.test(sentence)) {
    // Reviewed wording variants only. An unnamed state register still needs
    // the same independently established California rights context above.
    const mandatory = /\b(?:(?:such|your|the|an) authorized agent (?:must|is required to)|authorized agents in California must) be registered with (?:the )?(?:California )?Secretary of State/i.test(sentence) ||
      /\bonly you\s*,?\s*or a person registered with (?:the )?(?:California )?Secretary of State[^.!?]{0,180}\bmay make (?:a |an )?(?:CCPA |verifiable (?:consumer )?)?request/i.test(sentence);
    if (!mandatory || /\b(?:need not|not required|does not need|(?:do|does) not require|not (?:true|the case) that|may (?:choose|use)|(?:no|not (?:all|every|any)) authorized agents?)\b/i.test(sentence)) return null;
    if (/\b(?:alternatively|may authorize|permits? any)[^.!?]{0,180}\b(?:natural person|unregistered)\b/i.test(context) ||
        /\b(?:registration|registered)[^.!?]{0,100}\b(?:does not apply|not required|except)\b/i.test(context) ||
        /\bnatural persons?[^.!?]{0,120}\b(?:need not|not required|without registering|exempt)\b/i.test(context) ||
        /\bregistered with[^.!?]{0,180}\bor (?:any|a|an|another) (?:(?:natural|unregistered) )?(?:person|individual|agent)\b/i.test(sentence) ||
        /\b(?:requirement|registration|condition)[^.!?]{0,100}\b(?:only|solely)[^.!?]{0,80}\b(?:business entities|companies|corporations|organizations)\b/i.test(context)) return null;
    family = "agent_registration"; scope = "authorized_agent";
  } else if (/\b(?:twice|two CCPA requests)\b/i.test(sentence)) {
    const operative = /\b(?:may only make|can only make|limit|decline)\b/i.test(sentence) && /\b(?:12.month|twelve.month|prior 12 months)\b/i.test(sentence);
    // An explicit general-rights heading and a non-access right are required.
    // Access-only limits, inferred scope, and qualified refusal language stay held.
    if (!operative || !/\bCCPA requests?\b/i.test(sentence) ||
        /\b(?:access|know|portability|copies|as (?:otherwise )?permitted|unless|except)\b/i.test(sentence) ||
        !/exercis(?:e|ing) your (?:CCPA |privacy )?rights/i.test(before) ||
        !/\b(?:delet(?:e|ion)|correct(?:ion)?)\b/i.test(before)) return null;
    if (lastMatch(before, /\b(?:right to (?:know|access)|access requests?|requests? (?:to|for) (?:know|access)|data portability)\b/gi) >
        lastMatch(before, /\bexercis(?:e|ing) your (?:CCPA |privacy )?rights\b/gi)) return null;
    if (/\b(?:limit|restriction)[^.!?]{0,80}\b(?:only|solely)[^.!?]{0,80}\b(?:access|know|copies|portability)\b/i.test(context)) return null;
    family = "blanket_frequency"; scope = "general_rights_requests";
  } else {
    if (!/\bonce\b[^.!?]{0,130}\bconfirm a verifiable consumer request\b[^.!?]{0,100}\b(?:we will|we shall) stop (?:selling|sharing)\b/i.test(sentence) ||
        !/\b(?:opt.out|do not sell|sale of)\b/i.test(context) ||
        /\b(?:if we (?:ever |later )?(?:sell|begin selling)|should we (?:sell|begin))\b/i.test(context) ||
        /\b(?:do not|never) require (?:a )?(?:verifiable|verified) (?:consumer )?request\b/i.test(context)) return null;
    if (/\bwe (?:do not|never) (?:sell|share)(?: or (?:sell|share))? (?:your |any )?personal (?:information|data)\s*[.!]/i.test(context) ||
        /\bopt.out[^.!?]{0,150}\bwithout[^.!?]{0,100}\b(?:identity|identification|verif(?:y|ication))\b/i.test(context)) return null;
    family = "opt_out_verification"; scope = "stated_opt_out_route";
  }
  return { kind: family, start, end, contextStart, contextEnd, scope };
}

/** Caller supplies only the existing CA projection's complete, verified positive
 * documents. No reads, models, absence inference, persistence or finding mapping.
 * The clock is injectable for deterministic budget tests; production uses the
 * fixed 10 ms cooperative budget. An overrun never implies a negative result. */
export function assessCaliforniaRestrictionShadow(
  documents: readonly CaliforniaPolicyDocument[], sourceBundleSha256: string,
  clock: () => number = () => performance.now(),
): CaliforniaRestrictionShadow {
  const deadline = clock() + CALIFORNIA_RESTRICTION_SHADOW_LIMITS.processingMs;
  const result: CaliforniaRestrictionShadow = {
    version: CALIFORNIA_RESTRICTION_SHADOW_VERSION, mode: "internal_shadow", scoreEffect: "none", sourceBundleSha256,
    status: "no_verified_sources", inspectedDocuments: 0, inspectedChars: 0, candidateInspections: 0,
    heldCandidates: 0, limitations: [], candidates: [],
  };
  const limit = (reason: CaliforniaRestrictionShadow["limitations"][number]) => {
    if (!result.limitations.includes(reason)) result.limitations.push(reason);
  };
  if (documents.length > 8) limit("document_limit");
  outer: for (const document of documents.slice(0, 8)) {
    if (clock() >= deadline) { limit("time_limit"); break; }
    if (!document.text || document.text.length > 160_000 || document.evidenceRef.length > 240 ||
        !/^[a-f0-9]{64}$/.test(document.textSha256)) { limit("unsupported_source"); continue; }
    result.inspectedDocuments++;
    for (let offset = 0; offset < document.text.length; offset += 8_000) {
      if (clock() >= deadline) { limit("time_limit"); break outer; }
      const chunk = document.text.slice(offset, offset + 8_000 + 400);
      result.inspectedChars += Math.min(8_000, document.text.length - offset);
      anchor.lastIndex = 0;
      for (const match of chunk.matchAll(anchor)) {
        if (match.index! >= 8_000) break;
        if (clock() >= deadline) { limit("time_limit"); break outer; }
        if (result.candidateInspections >= 32) { limit("candidate_limit"); break outer; }
        result.candidateInspections++;
        const qualified = qualify(document.text, offset + match.index!, match[0].length);
        if (!qualified) { result.heldCandidates++; continue; }
        if (result.candidates.some(candidate => candidate.kind === qualified.kind)) continue;
        result.candidates.push({ ...qualified, evidenceRef: document.evidenceRef, textSha256: document.textSha256 });
      }
    }
  }
  if (clock() >= deadline) limit("time_limit");
  result.status = result.limitations.length ? "limited" : result.inspectedDocuments ? "evaluated" : "no_verified_sources";
  while (encoder.encode(JSON.stringify(result)).byteLength > 2_048 && result.candidates.length) {
    result.candidates.pop(); limit("output_limit"); result.status = "limited";
  }
  return californiaRestrictionShadowSchema.parse(result);
}
