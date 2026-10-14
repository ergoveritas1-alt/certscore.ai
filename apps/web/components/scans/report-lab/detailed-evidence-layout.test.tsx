import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { detailedEvidenceLayout } from "./detailed-evidence-layout";
import { EvidenceDirectory } from "./shadow-scan-report";
import { SHADOW_REPORT } from "./shadow-report-data";
import { projectCmpAudit } from "../../../lib/scans/cmp-audit-projection";

function fixture() {
  const audit = projectCmpAudit({scanId: "fixture"});
  audit.rows.find(r=>r.id==="banner")!.status="Observed";
  Object.assign(audit.rows.find(r=>r.id==="privacy_link")!, {status:"Observed",sourceIds:["privacy_notice_availability"]});
  Object.assign(audit.rows.find(r=>r.id==="implementation")!, {status:"Review recommended",sourceIds:["post_reject_tracking_reduction"]});
  const row=(id:string,title:string,status:"Observed"|"Limited"|"Potential gap"="Observed")=>({id,title,status,summary:`Retained ${title}`,correctionSteps:[],evidenceJson:{rowId:id},evidenceRefs:[]});
  return {...SHADOW_REPORT,cmpAudit:audit,controls:{accept:"Observed",reject:"Observed",options:"Observed"},
    consentRows:[row("consent_surface_observed","Consent mechanism"),row("cmp_framework_signal_observed","CMP framework"),
      row("accept_consent_control","Accept consent control"),row("options_settings_preferences_control","Options control"),
      row("reject_all_path_availability","Decline consent control","Limited"),row("post_reject_tracking_reduction","Post-Reject activity","Potential gap"),
      row("cookie_notice_policy_availability","Cookie notice / cookie policy availability")],
    gdprTransparencyRows:[row("privacy_notice_availability","Privacy notice link/surface discovered")]};
}

test("consolidation routes duplicate evidence without changing assessments and omits the removed Decline presentation",()=>{
  const report=fixture(),before=structuredClone(report),layout=detailedEvidenceLayout(report);
  assert.equal(layout.consentLinks.consent_surface_observed?.targetId,"cmp-criterion-banner");
  assert.equal(layout.consentLinks.post_reject_tracking_reduction?.targetId,"cmp-criterion-implementation");
  assert.equal(layout.cmpLinks.privacy_link?.targetId,"evidence-row-privacy_notice_availability");
  assert.equal(layout.consentLinks.accept_consent_control?.targetId,"consent-choice-controls");
  assert.equal(layout.consentLinks.accept_consent_control?.showLink,false);
  assert.equal(layout.consentLinks.options_settings_preferences_control?.showLink,false);
  assert.equal(layout.consentLinks.reject_all_path_availability?.targetId,"cmp-criterion-reject");
  assert.equal(layout.consentLinks.reject_all_path_availability?.showLink,false);
  assert.equal(layout.consentRows.find(r=>r.id==="reject_all_path_availability"),report.consentRows[4]);
  assert.equal(layout.cookieRows[0]?.summary,"A cookie policy or disclosure notice was found.");
  assert.deepEqual(report,before);
});

test("absent or different primary evidence cannot hide a finding",()=>{
  const report=fixture();report.cmpAudit.rows.find(r=>r.id==="banner")!.status="Not assessed";
  report.cmpAudit.rows.find(r=>r.id==="implementation")!.sourceIds=[];
  report.cmpAudit.rows.find(r=>r.id==="privacy_link")!.sourceIds=["unrelated-policy"];
  report.consentControlsAvailable=false;
  const layout=detailedEvidenceLayout(report);
  assert.deepEqual(Object.keys(layout.consentLinks),["reject_all_path_availability"]);
  assert.equal(layout.consentLinks.reject_all_path_availability?.showLink,false);
  assert.deepEqual(layout.cmpLinks,{});
});

test("both layouts keep one full shared view, working aliases and distinct checks",()=>{
  for(const compact of [true,false]) {
    const html=renderToStaticMarkup(<EvidenceDirectory report={fixture()} compact={compact}/>);
    assert.match(html,/data-shared-evidence-target="cmp-criterion-implementation"/);
    assert.equal((html.match(/id="evidence-row-privacy_notice_availability"/g)??[]).length,1);
    assert.match(html,/href="#evidence-row-privacy_notice_availability"/);
    const privacy=html.slice(html.indexOf('id="cmp-criterion-privacy_link"'),html.indexOf('id="cmp-criterion-privacy_access"'));
    assert.doesNotMatch(privacy,/JSON evidence|Correction steps/);
    assert.match(privacy,/View privacy-policy discovery evidence/);
    assert.doesNotMatch(html,/>Decline consent control</);
    assert.match(html,/id="evidence-row-reject_all_path_availability"[^>]*data-shared-evidence-target="cmp-criterion-reject"/);
    for(const id of ["privacy_access","duration","declared_not_found","found_not_declared","cookie_information"])assert.match(html,new RegExp(`id="cmp-criterion-${id}"`));
    assert.ok(html.indexOf('id="evidence-row-cookie_notice_policy_availability"')>html.indexOf('Policies &amp; disclosures'));
    assert.doesNotMatch(html,/Platform identification evidence|Preference check:/);
  }
});
