import { californiaObservedScoreBasisSchema, getUsableRuntimeVisitSnapshot, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { parse } from "tldts";
import { createHash } from "node:crypto";

function documentUrl(value:string) {
  try {
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol) || url.username || url.password)return null;
    return url.toString();
  } catch {return null;}
}

/** Exact HTTPS homepages of one ICANN registrable domain; no tenant suffix,
 * alternate path, port, credentials, query or fragment grants identity. */
function apexWwwPair(left: string, right: string) {
  try {
    const a = new URL(left), b = new URL(right);
    if (a.href !== left || b.href !== right || [a,b].some(url => url.protocol !== "https:" ||
        url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        url.hostname.length > 253 || url.hostname.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) return false;
    const domain = parse(a.hostname, { allowPrivateDomains: true });
    return domain.isIcann && !domain.isPrivate && !domain.isIp && Boolean(domain.domain) &&
      ((a.hostname === domain.domain && b.hostname === `www.${domain.domain}`) ||
       (b.hostname === domain.domain && a.hostname === `www.${domain.domain}`));
  } catch { return false; }
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
  let apexWwwRecovery = false;
  if (!exactSnapshot) {
    const runtimeUrl=documentUrl(snapshot.url);
    const lane=bundle.scanLaneRuns?.find(row=>row.laneId==="runtime_evidence");
    // This is two independently retained visits, never a changed document in
    // one visit. Preserve exact parent binding and require positive navigation
    // plus the report's own retained URL; unrelated destinations stay unknown.
    const startingPage = documentUrl(bundle.normalizedUrl);
    apexWwwRecovery = Boolean(runtimeUrl && startingPage === exactFinalUrl &&
      apexWwwPair(exactFinalUrl, runtimeUrl) && documentUrl(bundle.url) === startingPage &&
      lane?.navigationAttempts?.some(attempt => attempt.mode === "https_apex_www_recovery" &&
        attempt.outcome === "success" && typeof attempt.httpStatus === "number" && attempt.httpStatus >= 200 && attempt.httpStatus < 300 &&
        attempt.effectiveUrl === runtimeUrl && lane.navigationAttempts!.some(initial =>
          initial.sequence < attempt.sequence && initial.mode === "initial_https_navigation" && initial.effectiveUrl === startingPage)));
    if (!runtimeUrl || (!apexWwwRecovery && new URL(runtimeUrl).origin !== new URL(exactFinalUrl).origin) ||
        !bundle.domSnapshots.some(row=>documentUrl(row.url)===exactFinalUrl &&
          (!apexWwwRecovery || row.documentIdentity?.source === "cdp_loader_id" && Boolean(row.documentIdentity.token) && row.documentIdentity.token !== snapshot.documentIdentity!.token && Boolean(row.artifactId) && Boolean(row.path))) ||
        !lane?.navigationAttempts?.some(attempt=>attempt.outcome==="success" &&
          typeof attempt.httpStatus==="number" && attempt.httpStatus>=200 && attempt.httpStatus<300)) return undefined;
  }
  const parsed=californiaObservedScoreBasisSchema.safeParse({policyVersion:exactSnapshot ? "usable_starting_page_score.v1" : apexWwwRecovery ? "usable_starting_page_score.v3-apex-www-recovery" : "usable_starting_page_score.v2-independent-visit",
    ...(apexWwwRecovery ? {startingPageUrlSha256:createHash("sha256").update(bundle.normalizedUrl).digest("hex"),routeEvidence:"retained_https_apex_www_recovery.v1"} : {}),
    ...(!exactSnapshot ? {runtimeDocumentUrlSha256:createHash("sha256").update(snapshot.url).digest("hex")} : {}),
    scanId:bundle.scanId,documentUrl:finalUrl,sourceHash:source.sha256,
    documentToken:snapshot.documentIdentity!.token,domArtifactId:snapshot.artifactId,
    sourceLane:"runtime_evidence",accessOutcome:"representative_page",
    evidenceRef:"CanonicalEvidenceBundle.json#runtimeMetadataSnapshots"});
  return parsed.success?parsed.data:undefined;
}
