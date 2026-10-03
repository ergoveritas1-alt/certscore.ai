import { z } from 'zod';
import { evaluateLegalFrameworkValidity } from '@certscore/contracts';

export const OUTDATED_TRANSFER_DISCLOSURE_POLICY = 'outdated_transfer_disclosure.v1' as const;
const HISTORICAL_OR_CORRECTED = /\b(?:may|might|could|would|hypothetical|for example|zum beispiel|do not|does not|not certified|nicht|struck down|historical|historically|previously|formerly|invalidated|superseded|replaced|no longer|used to|was certified|was based|früher|ehemalig\w*|historisch\w*|ungültig|unwirksam|aufgehoben|ersetzt|nicht mehr)\b/iu;
function currentGuidance(text: string) {
  if (HISTORICAL_OR_CORRECTED.test(text)) return false;
  return /\b(?:we|our (?:provider|service provider|payment provider)|the (?:provider|company)).{0,120}\b(?:rely|relies|is certified|are certified|is based|transfer|transfers|use|uses)\b.{0,120}privacy[\s–—-]+shield\b/iu.test(text) ||
    /\b(?:wir|unser\w* (?:anbieter|dienstleister)).{0,120}\b(?:stützen|nutzen|verlassen|ist zertifiziert|sind zertifiziert|übermitteln)\b.{0,120}privacy[\s–—-]+shield\b/iu.test(text) ||
    /privacy[\s–—-]+shield.{0,120}\b(?:ombudsmann|ombudsman|ombudsperson)\b.{0,100}\b(?:hat|kann|ist|has|can|is)\b/iu.test(text);
}
const assessmentSchema = z.object({
  policyVersion: z.literal(OUTDATED_TRANSFER_DISCLOSURE_POLICY),
  canonicalId: z.literal('eu_us_privacy_shield'),
  sourceDocumentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceUrl: z.string().url().max(2000),
  scanDate: z.string().datetime(),
  evidenceText: z.string().min(35).max(1200),
  assessment: z.literal('obsolete_current_guidance'),
}).strict().refine(value => /^https?:\/\//.test(value.sourceUrl) && currentGuidance(value.evidenceText) &&
  evaluateLegalFrameworkValidity(value.evidenceText, value.scanDate).some(match => match.canonicalId === value.canonicalId && match.statusAtScan === 'invalidated'));

export function readOutdatedTransferDisclosureAssessment(value: unknown) {
  const parsed = assessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** WC01 interpretation, invoked only with a verified target-owned retained policy document. */
export function assessOutdatedTransferDisclosure(input: { text: string; sourceDocumentSha256: string; sourceUrl: string; scanDate?: string | Date | null }) {
  if (!input.scanDate || !Number.isFinite(new Date(input.scanDate).getTime())) return null;
  const text = input.text.slice(0,100_000).replace(/\s+/gu,' ');
  for (const match of Array.from(text.matchAll(/privacy[\s–—-]+shield/giu)).slice(0,32)) {
    const start = Math.max(0, match.index! - 400);
    const evidenceText = text.slice(start, start + 1200).trim();
    const assessment = readOutdatedTransferDisclosureAssessment({
      policyVersion: OUTDATED_TRANSFER_DISCLOSURE_POLICY, canonicalId:'eu_us_privacy_shield',
      sourceDocumentSha256:input.sourceDocumentSha256, sourceUrl:input.sourceUrl,
      scanDate:new Date(input.scanDate).toISOString(), evidenceText, assessment:'obsolete_current_guidance',
    });
    if (assessment) return assessment;
  }
  return null;
}
