import { californiaObservedScoreBasisSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";

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
  const lane=bundle.scanLaneRuns?.find(row=>row.laneId==="runtime_evidence");
  const assessments=[bundle.scanEvidenceLaneAssessment,bundle.scan_evidence_lane_assessment].filter(Boolean);
  if(bundle.scanNoGoAssessment?.decision==="no_go" || bundle.scan_no_go_assessment?.decision==="no_go" ||
    assessments.some(row=>row!.outcome==="no_go" || row!.lanes.homepageRuntime==="unusable") ||
    !["usable","limited_partial"].includes(bundle.runtimeCoverage?.coverageStatus ?? "") || bundle.runtimeCoverage?.silentEmpty ||
    !lane || !["success","degraded"].includes(lane.executionOutcome) ||
    lane.accessOutcome!=="representative_page" || lane.challengeDetected)return undefined;
  // Degraded inventory is independent of a successfully opened original page.
  // Require positive navigation proof before accepting a degraded runtime lane.
  if(lane.executionOutcome==="degraded" && !lane.navigationAttempts?.some(attempt=>
    attempt.outcome==="success" && typeof attempt.httpStatus==="number" &&
    attempt.httpStatus>=200 && attempt.httpStatus<300))return undefined;
  const exactFinalUrl=documentUrl(finalUrl);
  if(!exactFinalUrl)return undefined;
  const snapshot=bundle.runtimeMetadataSnapshots?.find(row=>documentUrl(row.url)===exactFinalUrl &&
    row.documentIdentity?.source==="cdp_loader_id" && row.documentIdentity.token && row.artifactId && row.path &&
    (row.textExcerpt?.trim() || row.siteMetadata?.title?.trim()));
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
