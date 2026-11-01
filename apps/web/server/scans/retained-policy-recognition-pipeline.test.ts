import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import fixtures from "../../../../packages/certscore-contracts/src/test-fixtures/retained-policy-recognition-five.json";
import {gdprTransparencyTopicCandidatesFromRetainedPolicySections} from "../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import {adaptGdprTransparencyTopicCandidatesForProduction} from "../../lib/scans/gdpr-transparency-topic-evidence-adapter";
import {buildNormalizedConcerns} from "../../lib/scans/normalized-concerns";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {buildGdprEprivacyChecklistPresentation} from "../../lib/scans/gdpr-eprivacy-checklist-presentation";
import type {ScanDetailResponse} from "./get-scan-by-id";

const require = createRequire(import.meta.url);
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = {exports: {}} as NodeModule;
const {buildCanonicalReportExport} = require("./report-export") as typeof import("./report-export");
const {buildReportPdfV2Model} = require("./report-pdf-v2-model") as typeof import("./report-pdf-v2-model");
const {buildApiV2ScanResource} = require("../../lib/api-v2/scan-resource") as typeof import("../../lib/api-v2/scan-resource");
const ids: Record<string,string> = {international_transfers:"international_transfers_disclosure",
  data_subject_rights:"data_subject_rights_disclosure",data_retention:"retention_disclosure_observed",legal_basis:"legal_basis_disclosure_observed"};

for (const f of fixtures) test(`qualified disclosure survives canonical projection and exports: ${f.id}`, () => {
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([{heading:"",textExcerpt:f.context, extractionMethod:"canonical_topic_window"}]);
  const surface = {surfaceType:"privacy_policy" as const,status:"fetched" as const,
    normalizedUrl:f.url,url:f.url,textExcerpt:f.context,gdprTransparencyTopicCandidates:candidates};
  const input = {surface,isTargetRelevantPrivacyPolicy:true,policyTextQuality:{usable:true}};
  for (const patch of [
    {isTargetRelevantPrivacyPolicy:false}, {policyTextQuality:{usable:false}},
    {surface:{...surface,status:"failed" as const}}, {profile:"legacy_only"},
  ]) assert.deepEqual(adaptGdprTransparencyTopicCandidatesForProduction({...input,...patch}).acceptedProductionSignals, []);
  const adapted = adaptGdprTransparencyTopicCandidatesForProduction(input);
  assert.ok(adapted.acceptedProductionSignals.some(x=>x.disclosureType===f.topic));
  const runtimeArtifacts = {policyDisclosureSummary:{article13DisclosureSignals:adapted.acceptedProductionSignals,
    gdprTransparencyEvidenceProfile:adapted.profile,gdprTransparencyProductionEvidenceEnabled:adapted.productionEvidenceEnabled}};
  const normalizedConcerns = buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  assert.ok(normalizedConcerns.some(x=>x.originKey===`gdpr_transparency.article13.${f.topic}`));
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:true});
  const checklistRows = deriveGdprEprivacyCoverageChecklist({coverageOutcomes,scanCompleted:true,coverageLimited:true,unifiedFindings:[]});
  const id = ids[f.topic]!;
  assert.equal(checklistRows.find(x=>x.id===id)?.evidenceState,"observed");
  const checklistPresentation = buildGdprEprivacyChecklistPresentation(checklistRows);
  const record = {scan:{id:f.scanId,domainHostname:f.site,status:"completed",scanType:"full",scanFromValue:"eu_ie",
      createdAt:"2026-10-31T12:00:00Z",startedAt:"2026-10-31T12:00:00Z",completedAt:"2026-10-31T12:00:10Z",pagesScanned:1,pagesRequested:1},
    snapshot:{report_projection_status:"ready"},runtimeArtifacts,trackerVendors:[],events:[],accessPostureSummary:{},
    canonicalReportProjection:{artifactVersion:"persisted-canonical-report-projection-v2",checklistRows,checklistPresentation,
      normalizedConcerns,derivedContext:{},globalUnifiedFindings:[],ownerUnifiedFindings:[],topFindingIds:[],legacyScoreAssessmentInput:{scanId:f.scanId}},
  } as unknown as ScanDetailResponse;
  const before=JSON.stringify(record);
  const report=buildCanonicalReportExport(record)!;
  assert.ok(report);
  const exported=report.appendix.gdprTransparency.rows.find(x=>x.id===id)!;
  assert.equal(exported.evidenceLabel,"Observed");
  assert.equal(exported.evidenceState,"observed");
  const pdf=buildReportPdfV2Model(report);
  const policy=pdf.sections.find(x=>x.id==="policy")!;
  const pdfRows = policy.blocks.flatMap(block=>block.kind==="table" ? block.rows : []);
  assert.equal(pdfRows.find(row=>row[0]===exported.label)?.[1],"Observed");
  assert.deepEqual(report.projection.unifiedFindings,[],"Disclosure presence does not invent a risk finding");
  const api=buildApiV2ScanResource(record);
  assert.equal(api.scanId,f.scanId);
  assert.equal(api.status,"completed");
  assert.equal(api.scoreStatus,"final");
  assert.equal(JSON.stringify(record),before);
});

const retention = fixtures[2]!;
const basis = fixtures[3]!;
const destination = fixtures[4]!;
const adversarialCases = [
  {name:"retention never", f:retention, text:retention.expectedExcerpt.replace("Resonate retains","Resonate never retains")},
  {name:"retention no longer", f:retention, text:retention.expectedExcerpt.replace("Resonate retains","Resonate no longer retains")},
  {name:"retention not even", f:retention, text:retention.expectedExcerpt.replace("Resonate retains","Resonate not even retains")},
  {name:"retention contraction", f:retention, text:retention.expectedExcerpt.replace("Resonate retains","Resonate isn't an entity that retains")},
  {name:"German enclosing parenthesis negation", f:basis, text:"Es werden keine (auch nicht personenbezogenen) "+basis.expectedExcerpt},
  {name:"German website negation", f:basis, text:basis.context.replace("Auf dieser Website werden","Auf dieser Website werden keine Daten")},
  {name:"German internal website-prefix negation", f:basis, text:basis.context.replace("unter Einsatz der", "unter Einsatz nicht der")},
  {name:"example destination", f:destination, text:destination.expectedExcerpt.replaceAll("Singapore","Example Country")},
  {name:"TBA destination", f:destination, text:destination.expectedExcerpt.replaceAll("Singapore","TBA")},
  {name:"unspecified destination", f:destination, text:destination.expectedExcerpt.replaceAll("Singapore","Not Specified")},
];
for (const c of adversarialCases) test(`unsupported source stays neutral through canonical policy: ${c.name}`, () => {
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([{heading:"",textExcerpt:c.text,extractionMethod:"canonical_topic_window"}]);
  const result = adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy:true,policyTextQuality:{usable:true},
    surface:{surfaceType:"privacy_policy",status:"fetched",normalizedUrl:c.f.url,url:c.f.url,textExcerpt:c.text,gdprTransparencyTopicCandidates:candidates}});
  assert.ok(!result.acceptedProductionSignals.some(x=>x.disclosureType===c.f.topic));
  const runtimeArtifacts={policyDisclosureSummary:{article13DisclosureSignals:result.acceptedProductionSignals,
    gdprTransparencyEvidenceProfile:result.profile,gdprTransparencyProductionEvidenceEnabled:result.productionEvidenceEnabled}};
  const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  assert.ok(!normalizedConcerns.some(x=>x.originKey===`gdpr_transparency.article13.${c.f.topic}`));
  const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:true});
  const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,scanCompleted:true,coverageLimited:true,unifiedFindings:[]});
  assert.equal(rows.find(x=>x.id===ids[c.f.topic])?.evidenceState,"not_testable");
});

test("German source qualification selects the actual affirmative clause and preserves independent context", () => {
  const negative="Es werden keine (auch nicht personenbezogenen) "+basis.expectedExcerpt;
  for (const text of ["Wir versenden keine Werbung. "+basis.context,negative+" "+basis.context,basis.context+" "+negative]) {
    const candidates=gdprTransparencyTopicCandidatesFromRetainedPolicySections([{heading:"",textExcerpt:text,extractionMethod:"canonical_topic_window"}]);
    assert.equal(candidates.find(x=>x.topic===basis.topic)?.evidenceText,basis.expectedExcerpt);
  }
});
