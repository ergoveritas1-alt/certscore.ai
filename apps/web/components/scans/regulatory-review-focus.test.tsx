import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrivacyAuditEvidence } from "@certscore/api-contracts";
import { CaliforniaPrivacyWorkpaper, RegulatoryReviewFocus } from "./regulatory-review-focus";
import { ReportPdfAccessProvider, ShadowReportShareMenu } from "./report-lab/shadow-report-actions";

test("review selector is compact and exposes both focus choices", () => {
  const markup = renderToStaticMarkup(<RegulatoryReviewFocus focus="ccpa_cpra" />);
  assert.match(markup, /<form[^>]+aria-label="Review focus"/);
  assert.match(markup, /<form[^>]+method="get"/);
  assert.doesNotMatch(markup, /Report view|>Review focus<\/span>/);
  assert.match(markup, /value="gdpr_eprivacy"[^>]+aria-pressed="false"/);
  assert.match(markup, /value="ccpa_cpra"[^>]+aria-pressed="true"/);
  assert.doesNotMatch(markup, /California visitor behavior|href="#gpc-evidence"|A separate CCPA\/CPRA score|Consent evidence/);
});

test("California evidence is scoped to CCPA and remains compact when unavailable", () => {
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" />);
  assert.match(html, /California privacy review/);
  assert.match(html, /Evidence unavailable/);
  assert.match(html, /does not establish that these items are absent/);
  assert.doesNotMatch(html, /<details[^>]+open=|0 retained choices/);
});

test("retained California choices and notices remain accessible only in CCPA focus", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false,
    controls: [{ kind: "your_privacy_choices", label: "Your privacy choices", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/choices", placement: "footer", evidenceRef: "choice:1", retrieval: "fetched", interaction: "not_tested" }],
    notices: [{ kind: "california_notice", url: "https://example.test/privacy", evidenceRef: "notice:1",
      directlyLinkedFromScannedPage: true, coverage: "partial", passages: [{ topic: "privacy_rights", excerpt: "You can request deletion." }] }],
  };
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" evidence={evidence} />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /1 choice · 1 notice/);
  assert.match(html, /href="https:\/\/example.test\/choices"/);
  assert.match(html, /You can request deletion/);
  assert.match(html, /Choices found/);
  assert.match(html, /Disclosures captured/);
  assert.match(html, /Privacy rights/);
  assert.match(html, /View retained passages/);
  assert.match(html, /Evidence scope/);
  assert.doesNotMatch(html, /Opt-out functionality and notice completeness were not tested/);
  assert.match(html, /Evidence provenance/);
  assert.doesNotMatch(html, /<details[^>]+open=/);
  assert.doesNotMatch(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />), /Effectiveness has not been verified/);
});

test("California evidence distinguishes identified links from verified visitor-facing choices", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v2", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false, controls: [], notices: [],
    controlCandidates: [{ kind: "cookie_settings", label: "Cookie Settings", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/cookie-settings", placement: "header_link",
      evidenceRef: "policy-surface:cookies", verification: "visibility_unverified" }],
  };
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /0 choices · 0 notices/);
  assert.match(html, /Link identified: “Cookie Settings” · visibility not verified/);
  assert.doesNotMatch(html, /Observed: “Cookie Settings”/);
});

test("advanced PDF downloads start with GDPR/ePrivacy while sharing preserves focus without legacy tracking exports", () => {
  const markup = renderToStaticMarkup(<ReportPdfAccessProvider allowed><ShadowReportShareMenu reportUrl="/scan/fixture?reviewFocus=ccpa_cpra" scanId="fixture" siteLabel="example.test" fullSite /></ReportPdfAccessProvider>);
  assert.match(markup, /format=pdf[^"<]*reviewFocus=gdpr_eprivacy/);
  assert.doesNotMatch(markup, /format=csv/);
  assert.doesNotMatch(markup, /workpaper=tracking/);
  assert.match(markup, /https%3A%2F%2Fcertscore.ai%2Fscan%2Ffixture%3FreviewFocus%3Dccpa_cpra/);
  assert.doesNotMatch(markup, /format=csv[^"<]*scope=full-site/);
});


test("privacy workpaper rejects evidence bound to another report", () => {
  const evidence = { contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "other", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false, controls: [], notices: [] } as const;
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" scanId="current" evidence={{ ...evidence, controls: [], notices: [] }} />);
  assert.match(html, /Evidence unavailable/);
  assert.doesNotMatch(html, /Source SHA-256/);
});


test("California coverage has one linked summary and one complete evidence review without mutating assessments", async () => {
  const {CaliforniaCoverageSummary} = await import("./regulatory-review-focus");
  const {SitePriorityReview} = await import("./site-priority-review");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} = await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview} = await import("../../server/scans/california-privacy-review-projection");
  const fixture = californiaCoverageFixture("Privacy Policy. California residents may request access, correction and deletion of personal information. We share personal information with service providers for billing. We use cookies for analytics.");
  fixture.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v7";
  fixture.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const assessment=projectCaliforniaPrivacyReview(fixture.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,fixture.policyEvidence)!;
  if(assessment.contractVersion!=="certscore.california-privacy-review.v7")throw Error("v7 expected");
  const before=structuredClone(assessment);
  const summary=renderToStaticMarkup(<CaliforniaCoverageSummary coverage={assessment.reviewCoverage}/>);
  assert.match(summary,/href="#california-privacy-evidence"/);
  assert.equal((summary.match(/>California coverage</g)??[]).length,1);
  assert.match(summary,/<details[^>]+group\/signal/);
  assert.match(summary,/View California privacy review/);
  assert.doesNotMatch(summary,/Rights clause assessment|Sale\/sharing clause assessment|Collection-notice matching/);
  const detail=renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" scanId={assessment.scanId} assessment={assessment}
    coverage={assessment.reviewCoverage} rightsAssessment={assessment.rightsAssessment} saleSharingAssessment={assessment.saleSharingAssessment}
    collectionNoticeAssessment={assessment.collectionNoticeAssessment} gpcAvailable/>);
  assert.equal((detail.match(/id="california-privacy-evidence"/g)??[]).length,1);
  for(const label of ["California privacy review","Assessment coverage","Rights clause assessment","Sale/sharing clause assessment","Collection-notice matching","Choice and request inspection","Sale/sharing choice inspection","Request routes on the scanned page"])assert.ok(detail.includes(label),label);
  assert.match(detail,/href="#gpc-evidence"/);
  const initial=detail.split("data-california-review-details")[0]!;
  assert.doesNotMatch(initial,/Rights wording found/);
  assert.doesNotMatch(initial,/Business applicability|unassessed|not determined|incomplete|Rights clause assessment|Assessment coverage|Source SHA-256/i);
  assert.match(detail,/Evidence &amp; assessment details/);
  assert.doesNotMatch(detail,/<details[^>]+open=/);
  assert.doesNotMatch(detail,/California review coverage|California coverage:|score deduction|point deduction/i);
  const top=renderToStaticMarkup(<SitePriorityReview findings={[]} pending={false} sitewideAvailable scannedPages={1} reviewFocus="ccpa_cpra" californiaAssessment={assessment}/>);
  assert.doesNotMatch(top,/data-testid="california-choice-inspection"|California review coverage/);
  assert.deepEqual(assessment,before);
});


test("regular and public report menus omit PDF downloads", () => {
  for (const allowed of [false, undefined]) {
    const menu = <ShadowReportShareMenu reportUrl="/scan/fixture" scanId="fixture" siteLabel="example.test" />;
    const markup = renderToStaticMarkup(allowed === undefined ? menu : <ReportPdfAccessProvider allowed={allowed}>{menu}</ReportPdfAccessProvider>);
    assert.doesNotMatch(markup, /format=pdf/);
    assert.match(markup, /format=json/);
  }
});


test("California snapshot leads with observed, not observed or unknown without effectiveness copy", async () => {
  const {CaliforniaCoverageSummary} = await import("./regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} = await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview} = await import("../../server/scans/california-privacy-review-projection");
  const fixture=californiaCoverageFixture();
  const review=projectCaliforniaPrivacyReview(fixture.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,fixture.policyEvidence)!;
  assert.ok("reviewCoverage" in review);
  const coverage=review.reviewCoverage;
  assert.match(renderToStaticMarkup(<CaliforniaCoverageSummary />),/data-opt-out-status="unknown"/);
  for (const state of ["observed","not_observed",null] as const) {
    const title=state === "observed" ? "Sale/sharing opt-out link observed" : state === "not_observed" ? "Sale/sharing opt-out link not observed" : "Sale/sharing opt-out link unknown";
    const choicePresence=state ? {state,title,scanId:fixture.bundle.scanId,sourceHash:"a".repeat(64),labels:state === "observed" ? ["Do Not Sell or Share My Personal Information"] : []} : null;
    const html=renderToStaticMarkup(<CaliforniaCoverageSummary coverage={coverage} choicePresence={choicePresence} />);
    assert.match(html,/Sale\/sharing opt-out/);
    assert.match(html,new RegExp(`data-opt-out-status="${state ?? "unknown"}"`));
    assert.match(html,/inline-flex h-\[22px\]/,"Uses the shared compact status badge");
    assert.equal((html.match(/<summary/g)??[]).length,state === "observed" ? 2 : 1);
    assert.ok(html.indexOf("data-california-opt-out-presence") < html.indexOf("View California privacy review"));
    assert.doesNotMatch(html,/effectiveness|unverified|deduction|<details[^>]* open=/i);
    if (!state) assert.doesNotMatch(html,/link not observed|link observed/);
  }
});

test('policy-listed methods support broad observed with an obvious expander',async()=>{
  const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
  const {policyChoiceMethodsSchema}=await import('@certscore/contracts');
  const methods=policyChoiceMethodsSchema.parse({version:'policy_choice_methods.v1',scanId:'fixture',reportDocumentUrl:'https://example.test/',sourceBundleSha256:'a'.repeat(64),scope:'linked_policy_document',
    homepagePresence:'not_established',saleSharingScope:'not_assessed',effectiveness:'not_verified',methods:[{
      label:'Do Not Sell My Info',kind:'do_not_sell_or_share',method:'email',destination:'mailto:optout@example.test',
      sourceDocumentUrl:'https://example.test/privacy',sourceDocumentUrlSha256:'b'.repeat(64),evidenceRef:'policy-surface:method',parentEvidenceRef:'policy-surface:policy'}]});
  const html=renderToStaticMarkup(<CaliforniaCoverageSummary policyChoiceMethods={methods} optOutPresence={{state:"observed"}}/>);
  assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/Methods listed in policy/);
  assert.match(html,/Show opt-out assessment details/);assert.match(html,/Hide opt-out assessment details/);assert.match(html,/Source policy/);
  assert.match(html,/Homepage availability, sale\/sharing scope and effectiveness are not established/);
  assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*<section[^>]*data-policy-choice-methods/);assert.doesNotMatch(html,/data-policy-choice-methods[^>]*open|deduct|points|opt-out link observed/i);
  const empty=renderToStaticMarkup(<CaliforniaCoverageSummary/>);assert.doesNotMatch(empty,/Methods listed in policy/);
});

test('frictionless exception is supporting detail inside the main opt-out disclosure',async()=>{
  const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
  const {frictionlessGpcExceptionSchema,FRICTIONLESS_GPC_DISCLOSURES,FRICTIONLESS_GPC_UNVERIFIED_REQUIREMENTS}=await import('@certscore/contracts');
  const assessment=frictionlessGpcExceptionSchema.parse({version:'frictionless_gpc_exception.v1',scanId:'fixture',documentUrl:'https://example.test/',sourceHash:'a'.repeat(64),
    scope:'retained_website_evidence',status:'unresolved',basis:'insufficient_evidence',
    disclosures:FRICTIONLESS_GPC_DISCLOSURES.map(id=>({id,status:'not_established'})),unverifiedRequirements:FRICTIONLESS_GPC_UNVERIFIED_REQUIREMENTS});
  const declaredRight="You have the right to opt-out of Selling and Sharing.";
  assessment.disclosures[0]={id:"opt_out_right",status:"declared",passage:{evidenceRef:"policy-text:policy",textSha256:"b".repeat(64),start:0,end:declaredRight.length,excerpt:declaredRight}};
  const html=renderToStaticMarkup(<CaliforniaCoverageSummary frictionlessGpcException={{assessment,sources:[{evidenceRef:'policy-text:policy',url:'https://example.test/privacy',sha256:'b'.repeat(64),complete:true}]}}/>);
  assert.match(html,/Frictionless GPC exception/);assert.match(html,/Unresolved/);assert.match(html,/Policy disclosure/);
  assert.match(html,/Show opt-out assessment details/);assert.match(html,/Source policy/);
  assert.match(html,/GPC handling and full scope unverified/);assert.match(html,/>…<\/span>/);
  assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*data-frictionless-evidence/);
  assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open/);
  assert.match(html,/Opt-out right described in policy/);assert.match(html,/Declared/);
  assert.doesNotMatch(html,/Right described in policy · Mechanism unknown|Named choice observed/);
  assert.doesNotMatch(html,/Named choice observed|opt-out link observed/);
  assert.match(html,/data-opt-out-status="unknown"/);assert.doesNotMatch(html,/exception verified|exception supported|compliant|deduct|six.point/i);
  assert.doesNotMatch(renderToStaticMarkup(<CaliforniaCoverageSummary/>),/Frictionless GPC exception/);
  const observed=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:"observed"}} frictionlessGpcException={{assessment,sources:[]}}/>);
  assert.match(observed,/data-opt-out-status="observed"/);assert.equal((observed.match(/<summary/g)??[]).length,2,"One main opt-out disclosure; no competing GPC disclosure");
});

test('scoped advertising signal retains scope inside the compact opt-out disclosure',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const {projectCaliforniaPrivacyReview}=await import('../../server/scans/california-privacy-review-projection');
 const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import('../../server/scans/california-review-coverage.fixture');
 const {CALIFORNIA_RUNTIME_LINK_POLICY}=await import('@certscore/contracts');
 const f=californiaCoverageFixture("L’affichage de publicités personnalisées est soumis au consentement. L'Utilisateur peut modifier ses choix à tout moment : Sur le Site : Lien « Gérer les cookies » en pied de page");
 f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
 f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage='fr');
 const r=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;assert.ok(r.contractVersion==='certscore.california-privacy-review.v10'&&r.optOutPresenceSignal);
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'observed',signal:r.optOutPresenceSignal}}/>);
 assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*Scope:.*Personalized advertising choices/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open/);
});

test('DOM source and page scope stay behind the compact opt-out expander',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const {optOutPresenceSignalSchema}=await import('@certscore/contracts');
 const label='Do Not Sell or Share My Personal Information';
 const signal=optOutPresenceSignalSchema.parse({version:'sale_sharing_opt_out_signal.v4',scanId:'fixture',documentUrl:'https://example.test/',sourceHash:'a'.repeat(64),
  state:'observed',basis:'visible_dom_opt_out_label',confidence:'signal',effectiveness:'not_verified',label,scope:'observed_page',scopeLabel:'Observed page only',sourceDocumentUrl:'https://example.test/',
  passage:{evidenceRef:'dom-text:dom_text_pre_consent',textSha256:'b'.repeat(64),start:2500,end:2500+label.length,excerpt:label},
  sourceBinding:{kind:'dom_snapshot',artifactId:'dom_text_pre_consent',documentToken:'own-document',capturedAtMs:1000,observedAt:'2026-10-24T12:00:01.000Z'}});
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'observed',signal}}/>);
 assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/Show opt-out assessment details/);
 assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*Scope:.*Observed page only/);assert.match(html,/Source page/);
 assert.doesNotMatch(html,/Source policy|<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});

test('new mobile, EU and provider advertising scopes stay inside the collapsed shared disclosure',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const {optOutPresenceSignalSchema,matchReviewedOptOutRoute}=await import('@certscore/contracts');
 const fixtures=(await import('../../server/scans/opt-out-cohort16.fixture.json')).default;
 for(const host of ['stripchat.mov','planetary.org','snafu.de']){
  const c=fixtures.find(c=>c.host===host)!;const match=matchReviewedOptOutRoute(c.instruction,c.context)!;
  const signal=optOutPresenceSignalSchema.parse({version:'sale_sharing_opt_out_signal.v5',scanId:'fixture',documentUrl:c.documentUrl,sourceHash:'a'.repeat(64),state:'observed',
   basis:c.kind,confidence:'signal',effectiveness:'not_verified',label:c.label,scope:c.scope,scopeLabel:match.scopeLabel,sourceDocumentUrl:c.sourceUrl,
   passage:{evidenceRef:'policy-text:fixture',textSha256:'b'.repeat(64),start:1000,end:1000+c.instruction.length,excerpt:c.instruction},
   ...(c.context?{contextPassage:{evidenceRef:'policy-text:fixture',textSha256:'b'.repeat(64),start:0,end:c.context.length,excerpt:c.context}}:{})});
  const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'observed',signal}}/>);
  assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/Show opt-out assessment details/);
  const scopeAt=html.indexOf(match.scopeLabel),detailsAt=html.indexOf('data-opt-out-evidence');assert.ok(scopeAt>detailsAt&&detailsAt>0);
  assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
 }
});

test('scoped Not observed keeps scope, limitations and source inside one obvious collapsed disclosure',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'not_observed',absenceScope:'Captured starting-page observations',absenceSourceUrl:'https://example.test/',absenceLimitations:['Some frames were not inspected.','Complete governing-policy text was not available.']}}/>);
 assert.match(html,/data-opt-out-status="not_observed"/);assert.match(html,/Show opt-out assessment details/);
 const before=html.slice(0,html.indexOf('data-opt-out-evidence'));assert.doesNotMatch(before,/Some frames|governing-policy text|Captured starting-page/);
 assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*Scope: Captured starting-page observations/);assert.match(html,/Some frames were not inspected/);assert.match(html,/Source page/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});

test('own-document negative scope and original inspection limits remain inside the compact expander',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'not_observed',absenceScope:'Captured main-document text only',absenceSourceUrl:'https://example.test/',absenceLimitations:['Dedicated choice inspection was unavailable.','The dedicated control inventory was truncated.']}}/>);
 assert.match(html,/data-opt-out-status="not_observed"/);assert.match(html,/Show opt-out assessment details/);
 assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*Captured main-document text only/);
 const summary=html.match(/<details[^>]*data-opt-out-evidence[^>]*><summary[\s\S]*?<\/summary>/)?.[0]??'';
 assert.ok(summary);assert.doesNotMatch(summary,/Dedicated choice|inventory was truncated|main-document text/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});

test('Joybuy UK advertising-cookie scope stays behind the existing compact Observed expander',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const {optOutPresenceSignalSchema,REVIEWED_UK_COOKIE_REFUSAL_RULE,JOYBUY_OPT_OUT_POLICY_REDIRECT:route}=await import('@certscore/contracts');
 const c=(await import('../../server/scans/opt-out-joybuy.fixture.json')).default;
 const passage={evidenceRef:'policy-text:joybuy',textSha256:'b'.repeat(64)};
 const signal=optOutPresenceSignalSchema.parse({version:'sale_sharing_opt_out_signal.v8',scanId:'joybuy',documentUrl:route.pageUrl,sourceHash:'a'.repeat(64),
  state:'observed',basis:'specific_policy_opt_out_instructions',confidence:'signal',effectiveness:'not_verified',label:REVIEWED_UK_COOKIE_REFUSAL_RULE.label,
  scope:REVIEWED_UK_COOKIE_REFUSAL_RULE.scope,scopeLabel:REVIEWED_UK_COOKIE_REFUSAL_RULE.scopeLabel,sourceDocumentUrl:route.finalUrl,
  passage:{...passage,start:1000,end:1000+c.instruction.length,excerpt:c.instruction},
  contextPassage:{...passage,start:0,end:c.context.length,excerpt:c.context},
  sourceBinding:{kind:'reviewed_policy_redirect',relationshipId:route.id,requestedUrl:route.requestedUrl,surfaceEvidenceRef:'policy-surface:joybuy',observedAt:'2026-10-24T12:00:01.000Z'}});
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'observed',signal}}/>);
 assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/Show opt-out assessment details/);
 const details=html.indexOf('data-opt-out-evidence');assert.ok(details>0);
 assert.doesNotMatch(html.slice(0,details),/UK policy|advertising-cookie refusal/);
 assert.ok(html.indexOf(signal.scopeLabel!)>details);assert.match(html,/Source policy/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});

test('Gate runtime-text scope and blocked consent capture stay behind the compact Not observed expander',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'not_observed',absenceScope:'Captured runtime main-document text only',absenceSourceUrl:'https://celeb.gate.cc/',
  absenceLimitations:['Control inspection was limited.','Complete governing-policy text was not available.','The separate consent capture showed a verification screen.']}}/>);
 const at=html.indexOf('data-opt-out-evidence');assert.ok(at>0);assert.match(html,/data-opt-out-status="not_observed"/);assert.match(html,/Show opt-out assessment details/);
 assert.doesNotMatch(html.slice(0,at),/runtime main-document|verification screen/);
 assert.match(html,/<details[^>]*data-opt-out-evidence[\s\S]*Captured runtime main-document text only/);assert.match(html,/The separate consent capture showed a verification screen/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});
test('declared advertising-cookie evidence retains template and unverified-link limits only in expanded details',async()=>{
 const {CaliforniaCoverageSummary}=await import('./regulatory-review-focus');
 const {projectCaliforniaPrivacyReview}=await import('../../server/scans/california-privacy-review-projection');
 const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,CA_FIXTURE_POLICY}=await import('../../server/scans/california-review-coverage.fixture');
 const {CALIFORNIA_NINE_POINT_LINK_POLICY}=await import('@certscore/contracts');
 const c=(await import('../../server/scans/opt-out-cookie-two.fixture.json')).default.find(c=>c.host==='mail.tm')!;
 const f=californiaCoverageFixture(CA_FIXTURE_POLICY+' '+c.context+' '+c.instruction+' '+c.template);
 f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_NINE_POINT_LINK_POLICY;
 const r=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;assert.ok(r?.contractVersion==='certscore.california-privacy-review.v10'&&r.optOutPresenceSignal);
 const html=renderToStaticMarkup(<CaliforniaCoverageSummary optOutPresence={{state:'observed',signal:r.optOutPresenceSignal}}/>);
 assert.match(html,/data-opt-out-status="observed"/);assert.match(html,/Policy contains template wording/);assert.match(html,/Instruction link destination was not retained/);assert.match(html,/COMPANY NAME/);
 const summary=html.match(/<details[^>]*data-opt-out-evidence[^>]*><summary[\s\S]*?<\/summary>/)?.[0]??'';
 assert.ok(summary);assert.doesNotMatch(summary,/template wording|destination|COMPANY NAME/);
 assert.doesNotMatch(html,/<details[^>]*data-opt-out-evidence[^>]*open|deduct|points/i);
});
