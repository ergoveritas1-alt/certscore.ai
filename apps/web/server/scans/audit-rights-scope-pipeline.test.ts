import test from 'node:test';import assert from 'node:assert/strict';
import {extractPolicyFacts,extractPolicySections,retainedArticle13SectionEvidenceFromSections,policyFactsForFetchedDocument,gdprTransparencyTopicCandidatesFromRetainedPolicySections,mergeGdprTransparencyTopicCandidates} from '../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner';
import {adaptGdprTransparencyTopicCandidatesForProduction} from '../../lib/scans/gdpr-transparency-topic-evidence-adapter';
import {buildNormalizedConcerns} from '../../lib/scans/normalized-concerns';
import {deriveGdprEprivacyCoveragePolicyOutcomes} from '../../lib/scans/gdpr-eprivacy-coverage-policy';
import {deriveGdprEprivacyCoverageChecklist} from '../../lib/scans/gdpr-eprivacy-coverage-checklist';
import {createRequire} from 'node:module';
import {buildGdprEprivacyChecklistPresentation} from '../../lib/scans/gdpr-eprivacy-checklist-presentation';
import type {ScanDetailResponse} from './get-scan-by-id';
const require=createRequire(import.meta.url),serverOnly=require.resolve('server-only');
require.cache[serverOnly]={exports:{}} as NodeModule;
const {buildCanonicalReportExport}=require('./report-export') as typeof import('./report-export');
const {buildReportPdfV2Model}=require('./report-pdf-v2-model') as typeof import('./report-pdf-v2-model');
const review='Minnesota residents also have the right to review the personal information used in the processing and, if it is inaccurate, have the profiling reevaluated.';
for(const [name,body,observed] of [['review_right',review,true],['generic_heading','Your Rights. Read our privacy policy. Cookie Notice. Security. Contact Us.',false],['directory','Submit a request to access non-public RDDS data.',false],['specific_heading','Your right to object to us processing your information.',true],['delegated_route','If you are seeking to exercise your rights under the CCPA, contact our customer directly. We process your personal information on their behalf.',true],['withdrawal','If you have provided consent for the processing of your personal information, you may have the right to withdraw your consent.',true],['directory_and_own_right','Submit a request to access non-public RDDS data. You have the right to access your personal information.',true]] as const)test(`Scoped rights survive canonical reporting without admitting navigation: ${name}`,()=>{
 const url='https://publisher.example/privacy',text='Privacy Policy. '+body;
 const retained=extractPolicySections({html:'',visibleText:text,sourceUrl:url}),sections=retainedArticle13SectionEvidenceFromSections(retained,url),facts=policyFactsForFetchedDocument(extractPolicyFacts(text),sections,{allowLegacyArticle13Extraction:true});
 const candidates=mergeGdprTransparencyTopicCandidates(facts.gdprTransparencyTopicCandidates,gdprTransparencyTopicCandidatesFromRetainedPolicySections(retained));
 const adapted=adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy:true,policyTextQuality:{usable:true},targetUrl:url,surface:{surfaceType:'privacy_policy',status:'fetched',normalizedUrl:url,url,textExcerpt:text,article13DisclosureSignals:facts.article13DisclosureSignals,gdprTransparencyTopicCandidates:candidates}});
 const excluded=adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy:false,policyTextQuality:{usable:true},targetUrl:url,surface:{surfaceType:'privacy_policy',status:'fetched',normalizedUrl:url,url,textExcerpt:text,article13DisclosureSignals:facts.article13DisclosureSignals,gdprTransparencyTopicCandidates:candidates}});assert.equal(excluded.acceptedProductionSignals.length,0);
 assert.equal(adapted.acceptedProductionSignals.some(s=>s.disclosureType==='data_subject_rights'),observed);
 const usScoped=name==='review_right'||name==='delegated_route';
 const projectedObserved=observed&&!usScoped;
 const signals=[...facts.article13DisclosureSignals,...adapted.acceptedProductionSignals];assert.equal(signals.some(s=>s.disclosureType==='data_subject_rights'),observed);
 const runtimeArtifacts={policyDisclosureSummary:{article13DisclosureSignals:signals,gdprTransparencyEvidenceProfile:adapted.profile,gdprTransparencyProductionEvidenceEnabled:adapted.productionEvidenceEnabled}};
 const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
 const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:true});
 const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,scanCompleted:true,coverageLimited:true,unifiedFindings:[]});
 const rightsRow=rows.find(r=>r.id==='data_subject_rights_disclosure')!;
 assert.equal(rightsRow.evidenceState==='observed',projectedObserved);
 if(usScoped){
  const evidence=rightsRow.criticalEvidence?.retainedEvidence as Record<string,unknown>;
  assert.equal(evidence.rightsJurisdictionScope,'us_state_only');
  assert.equal(evidence.signalObserved,'partial_us_state_rights');
  assert.ok(rightsRow.evidenceRefs.some(s=>s.includes('Excerpt:')));
 }
 const presentation=buildGdprEprivacyChecklistPresentation(rows);
 const record={scan:{id:'00000000-0000-4000-8000-000000000001',domainHostname:'publisher.example',status:'completed',scanType:'full',scanFromValue:'eu_ie',createdAt:'2026-11-04T00:00:00Z',startedAt:'2026-11-04T00:00:00Z',completedAt:'2026-11-04T00:00:10Z',pagesScanned:1,pagesRequested:1},snapshot:{report_projection_status:'ready'},runtimeArtifacts,trackerVendors:[],events:[],accessPostureSummary:{},canonicalReportProjection:{artifactVersion:'persisted-canonical-report-projection-v2',checklistRows:rows,checklistPresentation:presentation,normalizedConcerns,derivedContext:{},globalUnifiedFindings:[],ownerUnifiedFindings:[],topFindingIds:[],legacyScoreAssessmentInput:{scanId:'00000000-0000-4000-8000-000000000001'}}} as unknown as ScanDetailResponse;
 const before=JSON.stringify(record),report=buildCanonicalReportExport(record)!;
 const exported=report.appendix.gdprTransparency.rows.find(r=>r.id==='data_subject_rights_disclosure')!;
 assert.equal(exported.evidenceState==='observed',projectedObserved);
 const model=buildReportPdfV2Model(report),policy=model.sections.find(s=>s.id==='policy')!;
 const pdfRows=policy.blocks.flatMap(b=>b.kind==='table'?b.rows:[]);
 const pdfState=pdfRows.find(r=>r[0]===exported.label)?.[1];
 assert.equal(pdfState==='Observed',projectedObserved);
 if(!projectedObserved){
   assert.equal(exported.evidenceState,'not_testable');
   // Existing export/PDF wording differs for this canonical state. Preserve
   // the unresolved state here; label reconciliation is a separate audit item.
   assert.equal(exported.evidenceLabel,'Not confirmed');
   assert.equal(pdfState,'Not tested');
 }
 assert.deepEqual(report.projection.unifiedFindings,[]);
 assert.equal(JSON.stringify(record),before);

});
