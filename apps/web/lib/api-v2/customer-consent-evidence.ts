import {customerConsentEvidenceSchema} from '../../../../packages/certscore-api-contracts/src/customer-consent-evidence';
import {consentControlAssessmentSchema} from '@certscore/contracts';
import type {ScanDetailResponse} from '../../server/scans/get-scan-by-id';
import {getPersistedCanonicalReportProjection} from '../../server/scans/persisted-canonical-report-projection';
import {projectCmpAudit} from '../scans/cmp-audit-projection';
import {evaluateConsentControlReport} from '../scans/consent-control-report';
/** Pure public projection over the persisted snapshot only; never recover runtime controls. */
export function buildCustomerConsentEvidence(scan:ScanDetailResponse){
 const s=scan.snapshot as Record<string,any>|null|undefined,canonical=getPersistedCanonicalReportProjection(scan);
 if(s?.report_projection_status!=='ready'||typeof s.report_projection_source_hash!=='string'||!/^[a-f0-9]{64}$/.test(s.report_projection_source_hash)||typeof s.report_projection_version!=='string'||!canonical)return undefined;
 const binding={scanId:scan.scan.id,createdAt:scan.scan.createdAt,reportVersion:s.report_projection_version,reportSourceHash:s.report_projection_source_hash};
 const unavailable=(reason:string)=>customerConsentEvidenceSchema.parse({version:'certscore.customer-consent-evidence.v1',binding,status:'unavailable',reason,controls:[],criteria:[],checklist:[]});
 const candidates=[s.consentControlAssessment,s.consent_control_assessment].filter(x=>x!==undefined&&x!==null);
 if(!candidates.length)return unavailable('persisted_assessment_not_retained');
 const parsed=candidates.map(c=>consentControlAssessmentSchema.safeParse(c));
 if(parsed.some(p=>!p.success))return unavailable('persisted_assessment_invalid');
 const values=parsed.map(p=>p.data!);const a=values[0]!;
 if(values.some(v=>JSON.stringify(v)!==JSON.stringify(a)))return unavailable('conflicting_persisted_assessments');
 if(!evaluateConsentControlReport(a,scan.scan.id).report)return unavailable('assessment_scan_or_document_unavailable');
 const cmp=projectCmpAudit({scanId:scan.scan.id,consentControlAssessment:a,normalizedConcerns:canonical.normalizedConcerns,checklistRows:canonical.checklistRows,unifiedFindings:canonical.ownerUnifiedFindings});
 const packet=customerConsentEvidenceSchema.parse({version:'certscore.customer-consent-evidence.v1',binding,status:'available',reason:'persisted_snapshot_only',
  assessment:{version:a.artifactVersion,sourceHash:a.provenance.sourceHash,computedAt:a.provenance.computedAt,coverage:a.coverage.status},
  controls:Object.entries(a.controls).map(([id,c])=>({id,state:c.state,layer:c.layer,inspection:c.inspection?{policy:c.inspection.policy,status:c.inspection.status}:null,firstObservedAtMs:c.firstObservedAtMs,lastObservedAtMs:c.lastObservedAtMs})),
  criteria:cmp.rows.map(r=>({id:r.id,status:r.status,sourceIds:r.sourceIds.slice(0,4),sourceIdCount:r.sourceIds.length,sourceIdsTruncated:r.sourceIds.length>4})),
  checklist:canonical.checklistRows.filter(r=>['cmp_framework_signal_observed','consent_optional_defaults_on'].includes(r.id)).map(r=>({id:r.id,evidenceState:r.evidenceState,assessmentStatus:r.assessmentStatus})),
 });
 if(Buffer.byteLength(JSON.stringify(packet))>8192)return unavailable('public_packet_byte_cap');
 return packet;
}
