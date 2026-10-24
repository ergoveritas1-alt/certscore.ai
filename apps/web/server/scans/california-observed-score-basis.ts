import { californiaObservedScoreBasisSchema, getUsableRuntimeVisitSnapshot, type CanonicalEvidenceBundle } from "@certscore/contracts";

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
  const snapshot=getUsableRuntimeVisitSnapshot(bundle,bundle.runtimeMetadataSnapshots ?? [],exactFinalUrl);
  // The typed runtime snapshot (including page text or title) is retained in the
  // verified bundle. A merged consent-lane DOM file must not stand in for it.
  if(!snapshot)return undefined;
  const parsed=californiaObservedScoreBasisSchema.safeParse({policyVersion:"usable_starting_page_score.v1",
    scanId:bundle.scanId,documentUrl:finalUrl,sourceHash:source.sha256,
    documentToken:snapshot.documentIdentity!.token,domArtifactId:snapshot.artifactId,
    sourceLane:"runtime_evidence",accessOutcome:"representative_page",
    evidenceRef:"CanonicalEvidenceBundle.json#runtimeMetadataSnapshots"});
  return parsed.success?parsed.data:undefined;
}
