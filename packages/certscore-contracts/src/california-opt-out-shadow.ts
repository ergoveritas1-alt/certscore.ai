import type { CaliforniaPolicyDocument } from "./california-clause-assessment";
import { CALIFORNIA_OPT_OUT_SHADOW_VERSION, californiaRestrictionShadowSchema,
  type CaliforniaRestrictionShadow } from "./california-restriction-shadow";

const california = /\b(?:CCPA(?:\/CPRA)?|CPRA|California (?:residents?|consumers?|privacy|rights))\b/gi;
const otherJurisdiction = /\b(?:(?:Connecticut|Virginia|Colorado|Utah|Oregon|Texas|Montana|Delaware|Iowa|Indiana|Tennessee|New Jersey|United Kingdom|European Union|EU|EEA|UK|Canada|Canadian|Australia|Australian|Brazil|Brazilian) (?:residents?|consumers?|privacy|rights)|rights under (?:the )?GDPR|GDPR rights)\b/gi;
const optOut = /\b(?:opt[ -]out|do not sell|stop (?:selling|sharing))\b/i;
// Fixed reviewed grammars only. The list form binds an explicit procedure to
// sale/sharing rights, not a generic verification sentence near an opt-out.
const anchors = /\bOnce (?:we|We) receive and confirm a verifiable consumer request[^.!?\n]{0,100}\bwe will stop (?:selling|sharing)[^.!?\n]{0,100}[.!?]?|\bTo exercise any of the above rights,\s*please submit a verifiable consumer (?:privacy )?request[\s\S]{0,400}?\bFor us to fulfill your request,\s*you must provide sufficient information for us to reasonably verify that you are the consumer(?: from whom we collected the personal information)?[.!?]?|\bYou (?:must|are required to) verify your identity[^.!?\n]{0,100}\bbefore we (?:can )?(?:process|honou?r|fulfill)[^.!?\n]{0,100}\brequest to opt[ -]out of (?:the )?(?:sale|sharing)[^.!?\n]{0,80}[.!?]?/gi;
const noVerification = [
  /\b(?:no|without) (?:identity |identification )?verification[^.!?\n]{0,160}\b(?:opt(?:ing)?[ -]out|sale[ /]sharing)\b/i,
  /\b(?:identity |identification )?verification (?:is )?(?:not required|not necessary|unnecessary|optional)[^.!?\n]{0,160}\bopt(?:ing)?[ -]out\b/i,
  /\b(?:opt(?:ing)?[ -]out|do not sell)[^.!?\n]{0,180}\b(?:without|need not|does not require|do not require|not required|exempt)[^.!?\n]{0,100}\b(?:identity|identification|verif(?:y|ication|iable))\b/i,
  /\b(?:verification|requirement)[^.!?\n]{0,100}\b(?:does not apply|not applicable|not needed)[^.!?\n]{0,160}\bopt(?:ing)?[ -]out\b/i,
  /\bwe (?:do not|never) (?:ask|require)[^.!?\n]{0,100}\bverify (?:your |the consumer.s )?identity[^.!?\n]{0,100}\bopt(?:ing)?[ -]out\b/i,
  /\b(?:do not|never|not) require[^.!?\n]{0,100}\b(?:verifiable|verified|identity|identification)[^.!?\n]{0,160}\bopt[ -]out\b/i,
  /\b(?:verification|verif(?:y|ied)|requirement)[^.!?\n]{0,150}\b(?:only|solely)[^.!?\n]{0,150}\b(?:access|know|delet(?:e|ion)|correct(?:ion)?)[^.!?\n]{0,180}\bopt[ -]out[^.!?\n]{0,100}\b(?:exempt|not required|excluded)\b/i,
];
function lastMatch(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  let at = -1;
  for (const match of text.matchAll(pattern)) at = match.index!;
  return at;
}
function qualifies(text: string, start: number, end: number) {
  if (end - start > 600) return false;
  const before = text.slice(Math.max(0, start - 4_000), start), clause = text.slice(start, end);
  const scope = before + clause, ca = lastMatch(scope, california);
  if (ca < 0 || lastMatch(scope, otherJurisdiction) > ca) return false;
  const lead = text.slice(Math.max(0, start - 350), start);
  if (/\b(?:example wording|sample wording|previous (?:privacy )?policy|former (?:privacy )?policy|historical (?:privacy )?policy)\b/i.test(before) ||
      /\b(?:for example|example|sample|not (?:true|the case|correct) that|does not mean|wording we reject|(?:another|different|third[ -]party) business)\b/i.test(lead) ||
      /\b(?:if|when|where)[^.!?\n]{0,180}\b(?:fraud(?:ulent)?|suspicious|suspicion|good[ -]faith)\b/i.test(lead) ||
      /\b(?:(?:former|previous|old) (?:vendor|provider|business)|(?:used to|previously|formerly) (?:require|demand))\b/i.test(lead) ||
      /\b(?:previously|formerly|historically|would|could|unless|except)\b/i.test(clause) ||
      /\b(?:if we (?:ever |later )?(?:sell|begin selling)|should we (?:sell|begin))\b/i.test(lead + clause)) return false;
  if (/^To exercise any of the above rights/i.test(clause)) {
    // A substantive enumerated right and the explicit all-above procedure must
    // coexist inside the original jurisdiction window. No heading-only inference.
    if (!/\bRight to opt[ -]out of (?:the )?(?:sale|sharing)\b/i.test(before) ||
        !/\bYou have the right to opt[ -]out of (?:the )?(?:sale|sharing)\b/i.test(before)) return false;
    if (/\b(?:requests? to know|access requests?|access and deletion requests?)\b/i.test(lead)) return false;
  }
  if (/^Once /i.test(clause) && !optOut.test(text.slice(Math.max(0, start - 4_000), Math.min(text.length, end + 1_500)))) return false;
  return true;
}

/** Observer-only refinement. The completed v1 basis stays authoritative for
 * registration; this detached result never feeds canonical assessments/scores.
 * Uses only the original deadline and remaining shared32 inspection slots. */
export function hardenCaliforniaOptOutShadow(
  basis: CaliforniaRestrictionShadow, documents: readonly CaliforniaPolicyDocument[], deadline: number,
  clock: () => number = () => performance.now(),
): CaliforniaRestrictionShadow {
  const original = californiaRestrictionShadowSchema.parse(basis);
  const result: CaliforniaRestrictionShadow = {...original, version: CALIFORNIA_OPT_OUT_SHADOW_VERSION,
    limitations: [...original.limitations], candidates: original.candidates.filter(row => row.kind !== "opt_out_verification").map(row => ({...row}))};
  const limit = (reason: CaliforniaRestrictionShadow["limitations"][number]) => {
    if (!result.limitations.includes(reason)) result.limitations.push(reason);
    result.status = "limited";
  };
  const finish = () => {
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_048) {
      const opt = result.candidates.findIndex(row => row.kind === "opt_out_verification");
      if (opt >= 0) result.candidates.splice(opt, 1);
      limit("output_limit");
    }
    // Never evict registration/frequency facts to make room for research
    // diagnostics. A v1 fallback makes no v2 opt-out conclusion at all.
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_048)
      return {...original, limitations: [...original.limitations], candidates: original.candidates.filter(row => row.kind !== "opt_out_verification").map(row => ({...row}))};
    return californiaRestrictionShadowSchema.parse(result);
  };
  if (original.status !== "evaluated") return finish();
  const found: CaliforniaRestrictionShadow["candidates"] = [];
  try {
    if (documents.length > 8 || documents.length !== original.inspectedDocuments || documents.some(document =>
      !document.text || document.text.length > 160_000 || document.evidenceRef.length > 240 || !/^[a-f0-9]{64}$/.test(document.textSha256))) {
      limit("unsupported_source"); return finish();
    }
    for (const document of documents.slice(0, 8)) {
      let contradiction = false;
      const candidates: CaliforniaRestrictionShadow["candidates"] = [];
      // One bounded pass per document: reverse-worded and distant exceptions
      // remain visible. No160k rescans for every candidate and no additional reads.
      for (let offset = 0; offset < document.text.length; offset += 8_000) {
        if (clock() >= deadline) {limit("time_limit"); return finish();}
        const chunk = document.text.slice(offset, offset + 8_000 + 600);
        if (noVerification.some(pattern => pattern.test(chunk))) contradiction = true;
        if (/\bwe (?:do not|never) (?:sell|share)(?: or (?:sell|share))? (?:your |any )?personal (?:information|data)\s*[.!]/i.test(chunk) ||
            /\bif we (?:ever |later )?(?:sell|begin selling)\b/i.test(chunk)) contradiction = true;
        anchors.lastIndex = 0;
        for (const match of chunk.matchAll(anchors)) {
          if (match.index! >= 8_000) break;
          if (clock() >= deadline) {limit("time_limit"); return finish();}
          if (result.candidateInspections >= 32) {limit("candidate_limit"); return finish();}
          result.candidateInspections++;
          const start = offset + match.index!, end = start + match[0].length;
          if (!qualifies(document.text, start, end)) {result.heldCandidates++; continue;}
          candidates.push({kind: "opt_out_verification", evidenceRef: document.evidenceRef, textSha256: document.textSha256,
            start, end, contextStart: Math.max(0, start - 4_000), contextEnd: Math.min(document.text.length, end + 1_500), scope: "stated_opt_out_route"});
        }
      }
      if (!contradiction && candidates.length) found.push(candidates[0]!);
    }
    if (clock() >= deadline) {limit("time_limit"); return finish();}
    if (found.length) {
      // Preserve v1 row ordering for other families; at most one opt-out row.
      const oldIndex = original.candidates.findIndex(row => row.kind === "opt_out_verification");
      result.candidates.splice(oldIndex < 0 ? result.candidates.length : oldIndex, 0, found[0]!);
    }
  } catch {
    // Optional research cannot affect the saved registration basis or report.
    limit("unsupported_source");
  }
  return finish();
}
