import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {scopeReportPresentation,reportSectionInFocus,reportRowInFocus} from "./report-framework-scope";
import {REPORT_STATUS_LABELS,reportStatusLabel,accessibilityReportFollowUp} from "./report-status-presentation";
import {SHADOW_REPORT} from "../../components/scans/report-lab/shadow-report-data";
import {EvidenceDirectory} from "../../components/scans/report-lab/shadow-scan-report";
import {AccessibilityEvidence} from "../../components/scans/accessibility-evidence";
import {EvidenceStatusBadge} from "../../components/scans/evidence-status-badge";
import {buildDetailedEvidenceExport} from "./detailed-evidence-report";
import {buildReportDisplayExport} from "../api-v2/report-display-export";
import {selectReportEvidenceSection} from "../api-v2/report-evidence-selection";
import {accessibilityProjectionFixture} from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import {projectAccessibilityAuditSummary} from "./accessibility-audit-evidence";
import {californiaPriorityGpcFixture,QUALIFIED_URL} from "./test-fixtures/california-priority-gpc";
import {buildCanonicalGpcResponseProjection} from "./gpc-response-projection";
import {apiV2GpcResponseSchema} from "@certscore/api-contracts";
import {isRegulatoryFindingRelevant} from "./regulatory-review-catalog";
import {EvidenceDirectory as LegacyEvidenceDirectory} from "../../components/scanso2/report-lab/shadow-scan-report";
import {SHADOW_REPORT as LEGACY_REPORT,type ShadowReportData as LegacyShadowReportData} from "../../components/scanso2/report-lab/shadow-report-data";

const EU="regulatory_gap__gdpr_eprivacy__legal_basis_disclosure_observed";
Object.assign(globalThis,{React});

test("report focus scopes findings and sections with explicit focus overriding scan geography",()=>{
  const source={scan:{id:"scope",originCode:"CA"},reviewFocus:"gdpr_eprivacy",score:{value:80},californiaScore:{score:86},controls:{accept:"Observed"},
    gpcResponse:{proof:"retained"},gpcTimeline:{clockLabel:"Times from GPC visit start",events:[]},privacyAuditEvidence:{proof:"retained"},
    findings:[{id:"gpc_response",status:"Potential gap"},{id:EU,status:"Potential gap"},{id:"accessibility_priority_group",status:"Observed"}],
    gdprTransparencyRows:[{id:"legal_basis_disclosure_observed",status:"Observed"}],
    consentRows:[{id:"accept_consent_control",status:"Observed"},{id:"post_reject_tracking_reduction",status:"Gap observed"}],
    detailedEvidence:{sections:[{id:"gpc",rows:[]},{id:"privacy",rows:[]},{id:"policy",rows:[{id:"legal_basis_disclosure_observed",status:"Gap observed"},{id:"shared_policy_surface",status:"Observed"}],counts:{checks:2,review:1,limited:0,observed:1,unsupported:0},recap:"2 checks · 1 to review",displayStatus:"Review"}]}};
  const before=structuredClone(source),eu=scopeReportPresentation(source),ca=scopeReportPresentation({...source,reviewFocus:"ccpa_cpra"});
  assert.equal(eu.gpcResponse,undefined);assert.equal(eu.privacyAuditEvidence,undefined);
  assert.equal(eu.gpcTimeline,undefined,"the EU timeline cannot offer a California GPC session");
  assert.deepEqual(eu.findings.map(f=>f.id),[EU,"accessibility_priority_group"]);
  assert.equal(eu.detailedEvidence.sections.some(s=>s.id==="gpc"||s.id==="privacy"),false);
  assert.equal(ca.gpcResponse,source.gpcResponse);assert.equal(ca.privacyAuditEvidence,source.privacyAuditEvidence);
  assert.equal(ca.gpcTimeline,source.gpcTimeline);
  assert.deepEqual(ca.findings.map(f=>f.id),["gpc_response","accessibility_priority_group"]);
  assert.deepEqual(ca.gdprTransparencyRows,[]);
  assert.deepEqual(ca.consentRows,[],"EU checklist assessments stay scoped; observed controls have their own shared projection");
  assert.equal(ca.controls,source.controls);
  for (const id of ["transport_security_https_delivery", "transport_security_tls_certificate", "transport_security_http_redirect", "transport_security_mixed_content", "transport_security_form_transport"]) {
    assert.equal(reportRowInFocus(id,"ccpa_cpra"),true,"shared transport facts remain available without importing EU legal conclusions");
  }
  const scopedPolicy=ca.detailedEvidence.sections.find(section=>section.id==="policy")!;
  assert.equal(scopedPolicy.counts?.checks,1);assert.equal(scopedPolicy.counts?.review,0);
  assert.equal(scopedPolicy.displayStatus,null,"out-of-focus rows cannot leave an inherited review badge or count");
  assert.equal(ca.score,source.score);assert.equal(ca.californiaScore,source.californiaScore);
  assert.deepEqual(source,before);
  for(const id of ["post_reject_click_tracking","post_refusal_non_essential_activity","accept_reject_outcomes_indistinguishable"]){
    assert.equal(isRegulatoryFindingRelevant(id,"gdpr_eprivacy"),true);
    assert.equal(isRegulatoryFindingRelevant(id,"ccpa_cpra"),false);
  }
});

test("focused API exports preserve requested California focus on an EU visit and preserve both scores",()=>{
  const source={scan:{id:"scope",scanFrom:"eu_de"},reviewFocus:"ccpa_cpra",score:{value:80},californiaScore:{score:86},
    findings:[{id:"gpc_response",status:"Potential gap"},{id:EU,status:"Potential gap"}],gdprTransparencyRows:[{id:"legal_basis_disclosure_observed"}],
    detailedEvidence:{sections:[]}};
  const before=structuredClone(source);
  for(const section of ["policy","gpc","accessibility"] as const){
    const selected=selectReportEvidenceSection(source,section);
    const output=buildReportDisplayExport(selected.report) as Record<string,unknown>;
    assert.equal(output.reviewFocus,"ccpa_cpra");
    assert.deepEqual((output.findings as Array<{id:string}>).map(f=>f.id),["gpc_response"]);
    assert.deepEqual(output.score,source.score);
    assert.deepEqual(output.californiaScore,source.californiaScore);
    assert.doesNotMatch(JSON.stringify(output),new RegExp(EU));
  }
  assert.deepEqual(source,before);
});

test("web detailed evidence shows verified GPC only in California, including cross-region view switches",()=>{
  const assessment=californiaPriorityGpcFixture([QUALIFIED_URL]);
  if(assessment.contractVersion!=="certscore.gpc-response-assessment.v3")throw new Error("owned v3 observation expected");
  const pointer=(p:{lane:string;sha256:string;sizeBytes:number}|null)=>p?{lane:p.lane,sha256:p.sha256,sizeBytes:p.sizeBytes}:null;
  const publicGpc=apiV2GpcResponseSchema.parse({contractVersion:assessment.contractVersion,observation:assessment.observation,status:assessment.status,findingTitle:assessment.findingTitle,summary:"Existing qualified GPC observation.",scoreEffect:"none",legalInterpretation:"not_assessed",californiaPolicy:{applied:false,deductionPoints:0},evidenceUrl:"https://certscore.ai/api/v2/scans/fixture/findings/gpc_response",
    comparison:{comparable:assessment.comparison.comparable,protocol:assessment.comparison.protocol,baselineArtifact:pointer(assessment.comparison.baselineArtifact),gpcArtifact:pointer(assessment.comparison.gpcArtifact),enabledProof:assessment.comparison.enabledProof,deltas:assessment.comparison.deltas,delivery:{status:assessment.comparison.delivery.status},coverage:assessment.comparison.coverage,responseBasis:assessment.comparison.responseBasis,limitationKeys:assessment.comparison.limitationKeys}});
  const projected=buildCanonicalGpcResponseProjection([{unifiedFindingId:"gpc_response",summary:"Retained GPC observation.",presentationDecision:{status:"surface"},details:{family:"privacy_signal",kind:"gpc_response",assessment},scoreEffects:[]} as never]);
  assert.ok(projected);
  for(const focus of ["gdpr_eprivacy","ccpa_cpra"] as const){
    const report=structuredClone(SHADOW_REPORT);report.reviewFocus=focus;
    report.gpcResponse={...projected,evidenceRefs:[]};
    report.gdprTransparencyRows=report.gdprTransparencyRows.map(row=>({...row,title:"EU disclosure canary"}));
    const before=structuredClone(report);
    const html=renderToStaticMarkup(<EvidenceDirectory report={report}/>);
    assert.equal(html.includes('id="gpc-evidence"'),focus==="ccpa_cpra");
    assert.equal(html.includes("EU disclosure canary"),focus==="gdpr_eprivacy");
    assert.equal(html.includes('id="california-privacy-evidence"'),focus==="ccpa_cpra");
    const exported=buildReportDisplayExport({scan:{id:report.scan.id,scanFrom:"eu_de"},reviewFocus:focus,gpcResponse:publicGpc}) as Record<string,unknown>;
    assert.equal(Boolean(exported.gpcResponse),focus==="ccpa_cpra","verified API evidence follows the same explicit report scope");
    const legacy:LegacyShadowReportData=Object.assign(structuredClone(LEGACY_REPORT),{reviewFocus:focus,gpcResponse:{...projected,evidenceRefs:[]}});
    const legacyBefore:LegacyShadowReportData=structuredClone(legacy),legacyHtml=renderToStaticMarkup(<LegacyEvidenceDirectory report={legacy}/>);
    assert.equal(legacyHtml.includes('id="gpc-evidence"'),focus==="ccpa_cpra","retained legacy report routes use the same scope policy");
    assert.deepEqual(legacy,legacyBefore);
    assert.deepEqual(report,before);
  }
  assert.equal(reportSectionInFocus("gpc","ccpa_cpra"),true);
});

test("canonical labels preserve qualification and unknown statuses",()=>{
  for(const [raw,label] of Object.entries(REPORT_STATUS_LABELS)){
    assert.equal(reportStatusLabel(raw),label);
    assert.match(renderToStaticMarkup(<EvidenceStatusBadge label={raw} tone="review"/>),new RegExp(`>${label}<`));
  }
  assert.equal(reportStatusLabel("Potential gap"),"Potential gap");
  assert.equal(reportStatusLabel("Observed"),"Observed");
  assert.equal(reportStatusLabel("Future unknown status"),"Future unknown status");
});

test("both frameworks separate manual checks from failures in web and API evidence",()=>{
  const fixture=accessibilityProjectionFixture();
  fixture.observation.reviewItems=fixture.observation.violations.splice(0,2);
  fixture.observation.violations=[];
  const audit={...projectAccessibilityAuditSummary(fixture)!,status:"limited" as const,failedRuleCount:0,reviewRuleCount:2};
  assert.equal(accessibilityReportFollowUp(audit)?.kind,"manual");
  for(const focus of ["gdpr_eprivacy","ccpa_cpra"] as const){
    const report=structuredClone(SHADOW_REPORT);report.reviewFocus=focus;report.accessibilityAudit=audit;report.accessibilityEvidence=fixture.observation;
    const before=structuredClone(report),api=buildDetailedEvidenceExport(report).detailedEvidence;
    const section=api.sections.find(s=>s.id==="accessibility")!;
    assert.equal(section.displayStatus,"Manual check");
    assert.equal(section.counts.checks,2);assert.equal(section.counts.review,0);assert.equal(section.counts.manual,2);
    assert.ok(section.rows.every(row=>row.displayStatus==="Manual check"));
    assert.ok(section.rows.every(row=>row.status==="Review"),"preserve the existing source status contract");
    const html=renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={fixture.observation}/>);
    assert.match(html,/>Manual check</);assert.doesNotMatch(html,/>Review<|>Issues found<|>Needs review</);
    assert.deepEqual(report,before);
  }
  assert.equal(accessibilityReportFollowUp({...audit,failedRuleCount:1})?.kind,"review");
  assert.equal(accessibilityReportFollowUp({...audit,reviewRuleCount:0,failedRuleCount:null})?.kind,"limited");
  assert.equal(accessibilityReportFollowUp({...audit,status:"completed",reviewRuleCount:0}) ,null);
});
