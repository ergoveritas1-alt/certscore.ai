import {siteIntegrityProjectionSchema,formDestinationProjectionSchema} from '@certscore/contracts';
import type {ShadowReportData} from '../../components/scans/report-lab/shadow-report-data';
import {buildDetailedEvidenceExport} from '../scans/detailed-evidence-report';
import {buildApiV2PostureScores} from './posture-scores';
import {buildReportDisplayExport} from './report-display-export';
import type {EvidenceFocus} from './full-evidence-export';
/** Extra facts rendered by the report but omitted by the legacy display-file allowlist. */
function additionalReportEvidence(report:ShadowReportData,focus:EvidenceFocus){
 const site=(finding:NonNullable<ShadowReportData['siteIntegrity']>)=>{
  const parsed=siteIntegrityProjectionSchema.parse(finding.evidence);
  if(parsed.scanId!==report.scan.id)throw Error('Site-integrity report scan mismatch');
  const {documentToken:_privateDocumentToken,...observation}=parsed.observation;
  return {findingId:finding.findingId,title:finding.title,description:finding.description,summary:finding.summary,action:finding.action,severity:finding.severity,evidence:{...parsed,observation}};
 };
 const destinations=report.formDestinations?formDestinationProjectionSchema.parse(report.formDestinations):null;
 if(destinations&&destinations.scanId!==report.scan.id)throw Error('Form-destination report scan mismatch');
 return {
  ...(report.siteIntegrity?{siteIntegrity:site(report.siteIntegrity)}:{}),
  ...(report.siteIntegritySummary?{siteIntegritySummary:{coverage:report.siteIntegritySummary.coverage,findings:report.siteIntegritySummary.findings.map(site)}}:{}),
  ...(destinations?{formDestinations:{...destinations,trace:{...destinations.trace,events:destinations.trace.events.map(({documentToken:_privateDocumentToken,...event})=>event)}},formDestinationWarning:report.formDestinationWarning===true}:{}),
  ...(report.actionTimelines?{actionTimelines:report.actionTimelines}:{}),
  ...(report.afterAcceptFormsLimited!==undefined?{afterAcceptFormsLimited:report.afterAcceptFormsLimited}:{}),
  ...(report.collectionCoverage?{collectionCoverage:report.collectionCoverage}:{}),
  ...(focus==='ccpa_cpra'&&report.gpcResponse?{gpcPresentation:{observedFacts:report.gpcResponse.observedFacts,headline:report.gpcResponse.headline,summary:report.gpcResponse.summary,comparisonHeadline:report.gpcResponse.comparisonHeadline,coverageSummary:report.gpcResponse.coverageSummary,evidenceRefs:report.gpcResponse.evidenceRefs},...(report.gpcTimeline?{gpcTimeline:report.gpcTimeline}:{})}:{}),
 };
}
export function buildFullEvidenceReportView(report:ShadowReportData,focus:EvidenceFocus,standardEvidence:Record<string,any>,fullSiteReport?:unknown){
 const scoped={...report,reviewFocus:focus};
 const presented={...scoped,postureScores:buildApiV2PostureScores({score:report.score.value,scoreExplanation:report.scoreExplanation,californiaScore:report.californiaScore}),
  ...buildDetailedEvidenceExport(scoped),gpcResponse:standardEvidence.gpcResponse,
  ...(fullSiteReport?{fullSiteReport}:{})};
 return {...buildReportDisplayExport(presented,{scanId:report.scan.id}),reportEvidence:additionalReportEvidence(report,focus)};
}
