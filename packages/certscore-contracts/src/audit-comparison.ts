/** Compact provenance only; no new capture, inference or historical defaults. */
export const AUDIT_COMPARISON_VERSION='certscore.audit-comparison.v1' as const;
export const MAX_AUDIT_COMPARISON_BYTES=512;
export type AuditComparison={version:typeof AUDIT_COMPARISON_VERSION;scanId:string;createdAt:string;bundle:string;manifest:string;producer:string;profile:string};
export function readAuditComparison(value:unknown):AuditComparison|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as AuditComparison;
 if(Object.keys(r).sort().join(',')!=='bundle,createdAt,manifest,producer,profile,scanId,version'||
  r.version!==AUDIT_COMPARISON_VERSION||typeof r.scanId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(r.scanId)||
  typeof r.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r.createdAt)||!Number.isFinite(Date.parse(r.createdAt))||
  ![r.bundle,r.manifest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||
  typeof r.producer!=='string'||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(r.producer)||
  !['presence_only_six_workers.v1','conditional_opt_out_seven_workers.v1'].includes(r.profile)||
  Buffer.byteLength(JSON.stringify(r))>MAX_AUDIT_COMPARISON_BYTES)return null;
 return r;
}
/** Caller supplies hashes only after the existing byte/identity verification. */
export function buildAuditComparison(input:{scanId:string;createdAt:string;bundle:any;manifest:any;bundleSha256?:string|null;manifestSha256?:string|null}):AuditComparison|null {
 if(input.bundle?.scannerBuildProvenance?.contractVersion!=='scanner_build_provenance.v1'||input.bundle?.scanId!==input.scanId||input.manifest?.scanId!==input.scanId)return null;
 return readAuditComparison({version:AUDIT_COMPARISON_VERSION,scanId:input.scanId,createdAt:input.createdAt,
  bundle:input.bundleSha256,manifest:input.manifestSha256,
  producer:input.bundle?.scannerBuildProvenance?.gitSha,profile:input.manifest?.privacyCaptureProfile});
}

export const AUDIT_COMPARISON_UNAVAILABLE_VERSION='certscore.audit-comparison-unavailable.v1' as const;
export const COMPARISON_UNAVAILABLE_REASONS=['original_sources_unverified','source_identity_mismatch','scanner_build_not_retained','capture_profile_not_retained','capture_profile_unsupported','source_metadata_invalid'] as const;
export type ComparisonUnavailableReason=typeof COMPARISON_UNAVAILABLE_REASONS[number];
export type AuditComparisonUnavailable={version:typeof AUDIT_COMPARISON_UNAVAILABLE_VERSION;scanId:string;createdAt:string;reason:ComparisonUnavailableReason};
export type AuditComparisonDelivery=AuditComparison|AuditComparisonUnavailable;
export function readAuditComparisonDelivery(value:unknown):AuditComparisonDelivery|null {
 const available=readAuditComparison(value);if(available)return available;
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as AuditComparisonUnavailable;
 if(Object.keys(r).sort().join(',')!=='createdAt,reason,scanId,version'||r.version!==AUDIT_COMPARISON_UNAVAILABLE_VERSION||
  typeof r.scanId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(r.scanId)||
  typeof r.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r.createdAt)||!Number.isFinite(Date.parse(r.createdAt))||
  !COMPARISON_UNAVAILABLE_REASONS.includes(r.reason)||Buffer.byteLength(JSON.stringify(r))>MAX_AUDIT_COMPARISON_BYTES)return null;
 return r;
}
/** Reasons describe the producer's existing source checks, never inferred facts. */
export function buildAuditComparisonDelivery(input:Parameters<typeof buildAuditComparison>[0]&{sourcesVerified:boolean}):AuditComparisonDelivery|null {
 let reason:ComparisonUnavailableReason|undefined;
 if(!input.sourcesVerified)reason='original_sources_unverified';
 else if(input.bundle?.scanId!==input.scanId||input.manifest?.scanId!==input.scanId)reason='source_identity_mismatch';
 else if(input.bundle?.scannerBuildProvenance?.contractVersion!=='scanner_build_provenance.v1'||
  !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.bundle?.scannerBuildProvenance?.gitSha??''))reason='scanner_build_not_retained';
 else if(input.manifest?.privacyCaptureProfile==null)reason='capture_profile_not_retained';
 else if(!['presence_only_six_workers.v1','conditional_opt_out_seven_workers.v1'].includes(input.manifest.privacyCaptureProfile))reason='capture_profile_unsupported';
 if(!reason){const available=buildAuditComparison(input);if(available)return available;reason='source_metadata_invalid';}
 return readAuditComparisonDelivery({version:AUDIT_COMPARISON_UNAVAILABLE_VERSION,scanId:input.scanId,createdAt:input.createdAt,reason});
}
