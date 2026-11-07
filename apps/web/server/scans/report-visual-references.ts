import {getVisualEvidenceArtifacts,type VisualEvidenceArtifact} from '../../lib/scans/visual-evidence';
import type {ScanDetailResponse} from './get-scan-by-id';
const sha=/^[a-f0-9]{64}$/;
export function visualReferenceGeneration(scan:ScanDetailResponse){
 const s=scan.snapshot as Record<string,unknown>|null|undefined;
 return s?.report_projection_status==='ready'&&typeof s.report_projection_source_hash==='string'&&sha.test(s.report_projection_source_hash)&&typeof s.report_projection_version==='string'&&s.report_projection_version.length>0&&s.report_projection_version.length<=200
  ? {sourceHash:s.report_projection_source_hash,version:s.report_projection_version}:undefined;
}
/** Only saved, generation-bound references; no image reads or signing calls. */
export function buildReportVisualReferences(scan:ScanDetailResponse,documentUrl:string|null|undefined){
 const generation=visualReferenceGeneration(scan);if(!generation||!documentUrl)return [];
 const artifacts=getVisualEvidenceArtifacts(scan.runtimeArtifacts);
 return (['banner','reject','prominence'] as const).flatMap(kind=>{
  const cropKey=({banner:'bannerCrop',reject:'rejectCrop',prominence:'prominenceCrop'} as const)[kind];
  const a=artifacts.find(a=>a.status==='available'&&a.key&&a.sha256&&sha.test(a.sha256)&&a[cropKey]?.screenshotSha256===a.sha256&&
   (a.finalUrl??a.pageUrl)===documentUrl&&a.width===a[cropKey]?.imageWidth&&a.height===a[cropKey]?.imageHeight);
  if(!a)return [];
  const query=new URLSearchParams({expectedSha256:a.sha256!,expectedReportSource:generation.sourceHash,expectedReportVersion:generation.version});
  return [{kind,artifactId:a.id,sha256:a.sha256!,href:`/api/scans/${encodeURIComponent(scan.scan.id)}/visual-evidence/${encodeURIComponent(a.id)}?${query}`}];
 });
}
/** Metadata/generation gate, not a claim to rehash remote image bytes. Legacy unbound URLs keep their existing behavior. */
export function matchesReportVisualReference(params:URLSearchParams,scan:ScanDetailResponse,artifact:VisualEvidenceArtifact|null){
 const keys=['expectedSha256','expectedReportSource','expectedReportVersion'];
 if(!keys.some(k=>params.has(k)))return true;
 if(keys.some(k=>params.getAll(k).length!==1))return false;
 const g=visualReferenceGeneration(scan);
 return Boolean(g&&artifact?.status==='available'&&artifact.key&&sha.test(params.get('expectedSha256')??'')&&artifact.sha256===params.get('expectedSha256')&&g.sourceHash===params.get('expectedReportSource')&&g.version===params.get('expectedReportVersion'));
}
