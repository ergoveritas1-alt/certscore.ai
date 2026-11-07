import {buildPulseProjection} from '../pulse/projection';
import type {ScanDetailResponse} from '../../server/scans/get-scan-by-id';
import type {ShadowReportData} from '../../components/scans/report-lab/shadow-report-data';
import {buildFullEvidenceExport} from './full-evidence-export';
import {buildFullEvidenceReportView} from './full-evidence-report-view';
import {reportPresentationFocus} from '../scans/report-framework-scope';
/** One already-authorized, already-loaded report generation. No network, writes or extra capture. */
export function buildFullEvidencePackage(record:ScanDetailResponse,report:ShadowReportData,fullSiteReport?:unknown){
 if(record.scan.id!==report.scan.id)throw Error('Full package scan mismatch');
 const sourceHash=record.snapshot?.report_projection_source_hash,projectionVersion=record.snapshot?.report_projection_version;
 if(typeof sourceHash!=='string'||typeof projectionVersion!=='string')throw Error('Full evidence needs a retained projection generation');
 const retainedTime=record.snapshot?.report_projection_computed_at;
 const projectionTime=typeof retainedTime==='string'&&Number.isFinite(Date.parse(retainedTime))?retainedTime:record.scan.completedAt??record.scan.startedAt??record.scan.createdAt;
 const standardEvidence=buildPulseProjection({scanRecord:record,detail:'evidence',format:'json',freshnessMode:'latest',
  requestedUrl:report.scan.url,pulseRequestId:'report-evidence-'+record.scan.id,resolutionMode:'retained_report',waitSeconds:0,generatedAtIso:projectionTime}) as Record<string,any>;
 const reportViews={gdpr_eprivacy:buildFullEvidenceReportView(report,'gdpr_eprivacy',standardEvidence,fullSiteReport),ccpa_cpra:buildFullEvidenceReportView(report,'ccpa_cpra',standardEvidence,fullSiteReport)};
 return buildFullEvidenceExport({scanId:record.scan.id,sourceHash,projectionVersion,standardEvidence,reportViews,defaultFocus:reportPresentationFocus(report)});
}
