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
const usage='When you use our Services, we may collect information about your engagement with and utilization of our Services, such as processor and memory usage, storage capacity, navigation of our Services, and system-level metrics. We use this data to operate the Services, maintain and improve the performance and utilization of the Services, develop new features, protect the security and safety of our Services and our customers, and provide customer support.';
const recruitment='The situations in which we will process your personal information in accordance with the lawful bases set out above may include: making a decision about your recruitment or appointment;';
for(const [name,body,observed] of [['usage_data_and_purpose',usage,true],['conditional_recruitment',recruitment,true]] as const)test(`Bounded purpose context survives source-to-export pipeline: ${name}`,()=>{
 const url='https://publisher.example/privacy',text='Privacy Policy. '+body;
 const retained=extractPolicySections({html:'',visibleText:text,sourceUrl:url}),sections=retainedArticle13SectionEvidenceFromSections(retained,url),facts=policyFactsForFetchedDocument(extractPolicyFacts(text),sections,{allowLegacyArticle13Extraction:true});
 const candidates=mergeGdprTransparencyTopicCandidates(facts.gdprTransparencyTopicCandidates,gdprTransparencyTopicCandidatesFromRetainedPolicySections(retained));
 const adapted=adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy:true,policyTextQuality:{usable:true},targetUrl:url,surface:{surfaceType:'privacy_policy',status:'fetched',normalizedUrl:url,url,textExcerpt:text,article13DisclosureSignals:facts.article13DisclosureSignals,gdprTransparencyTopicCandidates:candidates}});
 const excluded=adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy:false,policyTextQuality:{usable:true},targetUrl:url,surface:{surfaceType:'privacy_policy',status:'fetched',normalizedUrl:url,url,textExcerpt:text,article13DisclosureSignals:facts.article13DisclosureSignals,gdprTransparencyTopicCandidates:candidates}});assert.equal(excluded.acceptedProductionSignals.length,0);
 assert.equal(adapted.acceptedProductionSignals.some(s=>s.disclosureType==='processing_purposes'),observed);
 const signals=[...facts.article13DisclosureSignals,...adapted.acceptedProductionSignals];assert.equal(signals.some(s=>s.disclosureType==='processing_purposes'),observed);
 const runtimeArtifacts={policyDisclosureSummary:{article13DisclosureSignals:signals,gdprTransparencyEvidenceProfile:adapted.profile,gdprTransparencyProductionEvidenceEnabled:adapted.productionEvidenceEnabled}};
 const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
 const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:true});
 const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,scanCompleted:true,coverageLimited:true,unifiedFindings:[]});
 assert.equal(rows.find(r=>r.id==='processing_purposes_disclosure')?.evidenceState==='observed',observed);
 const presentation=buildGdprEprivacyChecklistPresentation(rows);
 const record={scan:{id:'00000000-0000-4000-8000-000000000001',domainHostname:'publisher.example',status:'completed',scanType:'full',scanFromValue:'eu_ie',createdAt:'2026-11-04T00:00:00Z',startedAt:'2026-11-04T00:00:00Z',completedAt:'2026-11-04T00:00:10Z',pagesScanned:1,pagesRequested:1},snapshot:{report_projection_status:'ready'},runtimeArtifacts,trackerVendors:[],events:[],accessPostureSummary:{},canonicalReportProjection:{artifactVersion:'persisted-canonical-report-projection-v2',checklistRows:rows,checklistPresentation:presentation,normalizedConcerns,derivedContext:{},globalUnifiedFindings:[],ownerUnifiedFindings:[],topFindingIds:[],legacyScoreAssessmentInput:{scanId:'00000000-0000-4000-8000-000000000001'}}} as unknown as ScanDetailResponse;
 const before=JSON.stringify(record),report=buildCanonicalReportExport(record)!;
 const exported=report.appendix.gdprTransparency.rows.find(r=>r.id==='processing_purposes_disclosure')!;
 assert.equal(exported.evidenceState==='observed',observed);
 const model=buildReportPdfV2Model(report),policy=model.sections.find(s=>s.id==='policy')!;
 const pdfRows=policy.blocks.flatMap(b=>b.kind==='table'?b.rows:[]);
 const pdfState=pdfRows.find(r=>r[0]===exported.label)?.[1];
 assert.equal(pdfState==='Observed',observed);
 if(!observed){
   assert.equal(exported.evidenceState,'not_testable');
   // Existing export/PDF wording differs for this canonical state. Preserve
   // the unresolved state here; label reconciliation is a separate audit item.
   assert.equal(exported.evidenceLabel,'Not confirmed');
   assert.equal(pdfState,'Not tested');
 }
 assert.deepEqual(report.projection.unifiedFindings,[]);
 assert.equal(JSON.stringify(record),before);

});
