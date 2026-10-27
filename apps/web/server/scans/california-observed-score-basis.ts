import { californiaObservedScoreBasisSchema, getUsableRuntimeVisitSnapshot, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { createHash } from "node:crypto";

function documentUrl(value:string) {
  try {
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol) || url.username || url.password)return null;
    return url.toString();
  } catch {return null;}
}

/** Uses only retained runtime-lane evidence after canonical bundle verification.
 * It does not borrow consent/policy completeness or invent missing observations. */
export function projectCaliforniaObservedScoreBasis(bundle:CanonicalEvidenceBundle,
  source:{sha256?:string;verificationStatus?:string}|undefined, finalUrl:string) {
  if(source?.verificationStatus!=="verified" || !/^[a-f0-9]{64}$/.test(source.sha256??""))return undefined;
  const exactFinalUrl=documentUrl(finalUrl);
  if(!exactFinalUrl)return undefined;
  const snapshots=bundle.runtimeMetadataSnapshots ?? [];
  const exactSnapshot=getUsableRuntimeVisitSnapshot(bundle,snapshots,exactFinalUrl);
  const snapshot=exactSnapshot ?? getUsableRuntimeVisitSnapshot(bundle,snapshots);
  // The typed runtime snapshot (including page text or title) is retained in the
  // verified bundle. A merged consent-lane DOM file must not stand in for it.
  if(!snapshot)return undefined;
  if (!exactSnapshot) {
    const runtimeUrl=documentUrl(snapshot.url);
    const lane=bundle.scanLaneRuns?.find(row=>row.laneId==="runtime_evidence");
    // This is two independently retained visits, never a changed document in
    // one visit. Preserve exact parent binding and require positive navigation
    // plus the report's own retained URL; unrelated destinations stay unknown.
    if (!runtimeUrl || new URL(runtimeUrl).origin !== new URL(exactFinalUrl).origin ||
        !bundle.domSnapshots.some(row=>documentUrl(row.url)===exactFinalUrl) ||
        !lane?.navigationAttempts?.some(attempt=>attempt.outcome==="success" &&
          typeof attempt.httpStatus==="number" && attempt.httpStatus>=200 && attempt.httpStatus<300)) return undefined;
  }
  const parsed=californiaObservedScoreBasisSchema.safeParse({policyVersion:exactSnapshot ? "usable_starting_page_score.v1" : "usable_starting_page_score.v2-independent-visit",
    ...(!exactSnapshot ? {runtimeDocumentUrlSha256:createHash("sha256").update(snapshot.url).digest("hex")} : {}),
    scanId:bundle.scanId,documentUrl:finalUrl,sourceHash:source.sha256,
    documentToken:snapshot.documentIdentity!.token,domArtifactId:snapshot.artifactId,
    sourceLane:"runtime_evidence",accessOutcome:"representative_page",
    evidenceRef:"CanonicalEvidenceBundle.json#runtimeMetadataSnapshots"});
  return parsed.success?parsed.data:undefined;
}
