import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentBrief } from "./assessment-brief";
import { ASSESSMENT_HIGHLIGHTS_MAX_LENGTH, buildAssessmentHighlights, buildAssessmentHighlightsPresentation } from "./assessment-highlights";
const page = { kind: "page" } as const;
const privacy = Object.freeze({ id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found", status: "Potential gap", summary: "Completed discovery did not identify a privacy policy within the scanned scope.", correctionSteps: ["Publish a privacy policy explaining the site's personal-data practices."] });

test("supported missing-policy gaps stay visible and retain their existing highlight priority", () => {
  const findings = Object.freeze([Object.freeze({ id: "other", title: "Other issue" }), privacy]);
  const copy = buildAssessmentHighlights(findings, page);
  assert.match(copy, /^“Privacy policy not found”/);
  assert.match(copy, /Privacy policy not found within the assessed scope/);
  assert.ok(copy.includes(privacy.correctionSteps[0]!));
  assert.equal(findings[0]?.id, "other");
});

test("retrieval limitations and failed discovery cannot become missing-policy findings", () => {
  for (const findings of [[], [{ id: "privacy_policy_unavailable", title: "Privacy policy not retrievable", summary: "Retrieval failed; policy availability is not established." }]]) {
    const copy = buildAssessmentHighlights(findings, page);
    assert.doesNotMatch(copy, /Privacy policy not found/);
    if (findings.length) assert.match(copy, /availability is not established/);
  }
});

test("short assessments have no minimum-length padding or routine positive context", () => {
  const copy = buildAssessmentHighlights([{ title: "Review consent controls", summary: "Reject was not observed in this visit." }], page);
  assert.ok(copy.length < 340);
  assert.match(copy, /Reject was not observed in this visit/);
  assert.doesNotMatch(copy, /practical review aid|Other retained checks|Transport security checks/);
});

test("generic source boilerplate yields to the specific projected finding title", () => {
  const copy = buildAssessmentHighlights([{ id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "Non-essential activity after confirmed Reject", status: "Potential gap", summary: "Potential issue based on scan evidence." }], page);
  assert.match(copy, /Non-essential activity after confirmed Reject/);
  assert.doesNotMatch(copy, /Potential issue based on scan evidence/);
});

test("oversized prose cannot crowd out the action or secondary findings", () => {
  const copy = buildAssessmentHighlights([
    { title: "CMS security review", summary: "Retained version context. ".repeat(50), correctionSteps: ["Verify the declared release."] },
    { title: "Reject-path review" }, { title: "Accessibility issues" },
  ], page);
  assert.match(copy, /Verify the declared release/);
  assert.match(copy, /Reject-path review/);
  assert.match(copy, /Accessibility issues/);
  assert.ok(copy.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
});

test("CMS qualifications stay whole, including the limits of version detection", () => {
  const summary = "WordPress declares 4.5.33. The version is declared, not runtime-confirmed; verify the installed release and backported fixes.";
  assert.ok(buildAssessmentHighlights([{ title: "Unsupported CMS branch", summary }], page).includes(summary));
  const oversized = buildAssessmentHighlights([{ title: "Unsupported CMS branch", summary: `${summary} ${"Additional context. ".repeat(50)}` }], page);
  assert.doesNotMatch(oversized, /WordPress declares|Additional context/);
  assert.match(oversized, /retest the affected page/);
});

test("bounded negatives and unconfirmed actions preserve their projected meaning", () => {
  for (const summary of [
    "No activity observed during capture; this does not establish activity outside the captured window.",
    "Two requests were recorded after the click; semantic refusal registration remains unconfirmed.",
    "Exact unchanged storage persistence was observed; active use was not established.",
  ]) {
    const copy = buildAssessmentHighlights([{ title: "Action evidence review", summary }], page);
    assert.ok(copy.includes(summary));
    assert.doesNotMatch(copy, /did not stop|confirmed Reject path|tracking was not tested/);
  }
});

test("secondary titles receive context without inventing behavior or changing the brief", () => {
  const findings = [{ title: "Pre-consent storage", summary: "Classified non-essential storage was observed before consent." },
    { title: "Third-party embedded service", summary: "An embed was retained; tracking classification is not established." }];
  const brief = buildAssessmentBrief(findings, page);
  assert.equal(brief.secondary[0]?.summary, findings[1]!.summary);
  const copy = buildAssessmentHighlights(findings, page);
  assert.match(copy, /storage was observed before consent/);
  assert.match(copy, /“Third-party embedded service”: An embed was retained; tracking classification is not established/);
  assert.doesNotMatch(copy, /embed.*tracking observed|before the first consent surface/);
});

test("large lists retain their full source count internally without filling the paragraph with counts", () => {
  const findings = Array.from({ length: 1000 }, (_, index) => ({ id: `issue-${index}`, title: `Issue ${index + 1}` }));
  const brief = buildAssessmentBrief(findings, { kind: "site", scannedPages: 10 });
  assert.equal(brief.findingCount, 1000);
  assert.equal(brief.sourceRefs.length, 1000);
  const copy = buildAssessmentHighlights(findings, brief.scope);
  assert.ok(copy.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.doesNotMatch(copy, /1,000 priority|Issue 4/);
});

test("incomplete checks remain in the retained brief rather than the site assessment", () => {
  const context = { coverage: { state: "limited" as const, limitedCount: 2,
    items: [{ id: "privacy_notice_availability", title: "Privacy-policy discovery" }, { id: "transport_security_tls_certificate", title: "Website certificate" }] } };
  const before = structuredClone(context);
  const result = buildAssessmentHighlightsPresentation([], page, context);
  assert.equal(result.text, "No priority findings are available from this visit.");
  assert.deepEqual(result.links, []);
  assert.deepEqual(buildAssessmentBrief([], page, context).coverage, context.coverage);
  assert.doesNotMatch(result.text, /Could not complete|Privacy-policy discovery|Website certificate|no priority issues/i);
  assert.deepEqual(context, before);
});

test("owner-removed callouts do not return through an aggregate coverage count", () => {
  const context = { coverage: { state: "limited" as const, limitedCount: 1, items: [] } };
  const brief = buildAssessmentBrief([privacy], page, context);
  assert.equal(brief.coverage.state, "limited");
  assert.equal(brief.coverage.limitedCount, 1);
  assert.doesNotMatch(buildAssessmentHighlights([privacy], page, context), /Decline|checklist item|Could not complete|technically limited/);
});

test("accessibility groups name existing member findings and link the shared evidence", () => {
  const finding = { id: "accessibility_priority_group", title: "Accessibility issues", evidenceJson: {
    presentationGroup: "accessibility", findings: [{ id: "visual_contrast_accessibility_issue", title: "Visual contrast accessibility issue", summary: "Low-contrast text was detected on one page." }] } };
  const before = structuredClone(finding);
  const result = buildAssessmentHighlightsPresentation([privacy, finding], page);
  assert.match(result.text, /“Low text contrast”: Low-contrast text was detected/);
  assert.ok(result.links.some(link => link.label === "“Low text contrast”" && link.targetId === "accessibility-evidence"));
  assert.deepEqual(finding, before);
});

test("many incomplete checks do not crowd out established observations or the action", () => {
  const result = buildAssessmentHighlightsPresentation([privacy], page, { coverage: { state: "limited", items:
    Array.from({ length: 20 }, (_, i) => ({ id: `check-${i}`, title: `Check ${i}: ${"Long title ".repeat(8)}` })) } });
  assert.ok(result.text.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.match(result.text, /Privacy policy not found/);
  assert.ok(result.text.includes(privacy.correctionSteps[0]!));
  assert.doesNotMatch(result.text, /Could not complete|incomplete checks|Check 0/);
});

test("secondary Reject observation remains concrete when a long storage finding leads the summary", () => {
  const findings = [
    { id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", title: "Pre-consent storage classification review",
      summary: "Cookies or browser storage were retained before consent. First retained item: country (example.test): unknown, first observed 1.677s after scan start. Essentiality was not confirmed for every item.",
      correctionSteps: ["Review the supporting evidence and recommended fixes in Detailed evidence."] },
    { id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "Post-choice tracking reduction",
      summary: "Partial support from scan evidence; 2 tracking request(s) began after the Reject control was clicked (including Cloudflare); first observed 0.96s after the click. Review the recorded requests and how the Reject action controls this tracking activity." },
    { id: "accessibility_priority_group", title: "Accessibility issues" },
  ];
  const saved = structuredClone(findings);
  const context = {coverage:{state:"limited" as const,items:[{id:"tracking_before_consent",title:"Pre-consent non-essential tracking"}]}};
  const brief = buildAssessmentBrief(findings, page, context);
  const result = buildAssessmentHighlightsPresentation(findings, page, context);
  assert.equal(brief.primary?.id, findings[0]!.id);
  assert.match(result.expanded!.text, /Partial evidence: 2 tracking requests began after the Reject control was clicked/);
  assert.match(result.text, /Activity after a Reject click/);
  assert.doesNotMatch(result.text, /Could not complete/);
  assert.match(result.expanded!.text, /Essentiality was not confirmed/);
  assert.doesNotMatch(result.text, /confirmed Reject|failed to reject|ignored Reject/);
  assert.ok(result.links.some(link => link.label === "“Activity after a Reject click — review”"));
  assert.ok(result.text.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.deepEqual(findings, saved);
});

test("GPC site assessment keeps verified facts and omits causation and capture disclaimers", () => {
  const findings = [{ id: "gpc_response", title: "GPC choice-enforcement risk observed", status: "Partial concern",
    summary: "Bounded GPC observation completed. GPC was observed on the main-document request and browser property. CMP-recorded sale state: opted out; sharing state: opted out. GPC causation is not established. Retained GPC request samples include 27 classified advertising, marketing, analytics or replay requests, including 22 collection requests.",
    correctionSteps: ["Check that GPC applies the relevant sale/sharing opt-out state and governs advertising collection."] }];
  const before = structuredClone(findings);
  for (const scope of [page, { kind: "site", scannedPages: 10 } as const]) {
    const result = buildAssessmentHighlightsPresentation(findings, scope, { coverage: { state: "limited", items: [{ id: "cmp", title: "CMP capture" }] } });
    assert.match(result.text, /Global Privacy Control \(GPC\) was verified/);
    assert.match(result.text, /Consent platform recorded sale state: opted out; sharing state: opted out/);
    assert.match(result.text, /27 tracking requests; 22 collected data/);
    assert.doesNotMatch(result.text, /causation|limited|incomplete|could not|not established/i);
    assert.doesNotMatch(result.text, /GPC caused|GPC honored|compliant/i);
    assert.equal(result.text.split(findings[0]!.title).length - 1, 1);
    assert.equal(result.links[0]?.targetId, "gpc-evidence");
  }
  assert.deepEqual(findings, before);
  assert.ok(buildAssessmentBrief(findings, page).primary!.summary.includes("GPC causation is not established."));
});

test("partial GPC facts never become verified delivery or a known opt-out state", () => {
  for (const [states, expected] of [
    ["sale state: unknown; sharing state: unknown", ""],
    ["sale state: unknown; sharing state: opted out", "Consent platform recorded sharing state: opted out"],
    ["sale state: not opted out; sharing state: unknown", "Consent platform recorded sale state: not opted out"],
  ]) {
    const result = buildAssessmentHighlightsPresentation([{ id: "gpc_response", title: "GPC choice-enforcement risk observed",
      summary: `Bounded GPC observation was limited. Main-document GPC delivery was not fully verified. CMP-recorded ${states}. GPC causation is not established. Retained GPC request samples include 2 classified advertising, marketing, analytics or replay requests, including 1 collection requests.` }], page);
    assert.match(result.text, /2 tracking requests; 1 collected data/);
    assert.doesNotMatch(result.text, /causation|unknown|limited|delivery was verified|not fully verified/);
    if (expected) assert.ok(result.text.includes(expected));
    else assert.doesNotMatch(result.text, /CMP-recorded/);
  }
});

test("GPC highlights name the finding once and preserve assessed facts without unavailable comparison prose",()=>{
  const result=buildAssessmentHighlightsPresentation([{id:"gpc_response",title:"GPC choice-enforcement risk observed",status:"Partial concern",
    summary:"Bounded GPC observation completed. GPC was observed on the main-document request and browser property. The CMP's sale/sharing opt-out state was unavailable. 13 classified advertising, marketing, analytics or replay requests were observed with GPC, including 5 collection requests. Paired activity comparison: indeterminate.",
    correctionSteps:["Check that GPC applies the relevant sale/sharing opt-out state and governs advertising collection."]}],page);
  assert.equal(result.text.split("GPC choice-enforcement risk observed").length-1,1);
  assert.match(result.text,/Global Privacy Control \(GPC\) was verified/);
  assert.match(result.text,/13 tracking requests/);
  assert.match(result.text,/5 collected data/);
  assert.doesNotMatch(result.text,/opt-out setting could not be read/);
  assert.doesNotMatch(result.text,/inconclusive|indeterminate|state was unavailable/);
  assert.equal(result.links[0]?.targetId,"gpc-evidence");
  assert.ok(result.text.length<=ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
});

test("sparse grouped contrast report explains the issue and relevant fix without generic referrals", () => {
  const summary = "Low-contrast text was detected on 1 tested page (13 element failures). Retained examples measured 1.85:1 (required 3:1); 1.85:1 (required 4.5:1).";
  const findings = [{ id: "accessibility_priority_group", title: "Accessibility issues",
    summary: "Review automated accessibility findings and retained examples in Detailed evidence.",
    correctionSteps: ["Perform a targeted DOM audit. Add alt text, aria-labels and fix keyboard traps."],
    evidenceJson: { findings: [{id:"visual_contrast_accessibility_issue", title:"Visual contrast accessibility issue", summary}] } }];
  const before = structuredClone(findings);
  const result = buildAssessmentHighlightsPresentation(findings, page);
  assert.ok(result.text.includes(summary));
  assert.match(result.text, /Adjust the affected text and background colors.*then retest/);
  assert.doesNotMatch(result.text, /Review|alt text|aria-label|keyboard/);
  assert.equal(result.links[0]?.targetId, "accessibility-evidence");
  assert.equal(result.expanded, undefined);
  assert.deepEqual(findings, before);
});

test("known finding families have concrete fallback steps at every severity", () => {
  const cases = [
    ["site_integrity_hidden_outbound_links", /Trace the hidden links.*preserving legitimate skip links/],
    ["site_integrity_cms_security", /Verify the installed version and backported fixes/],
    ["regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", /purpose.*confirmed non-essential storage/],
    ["regulatory_gap__gdpr_eprivacy__session_replay_fingerprinting_review", /replay activation and sensitive-field masking/],
    ["regulatory_gap__gdpr_eprivacy__device_identification_fingerprinting_signal_observed", /scripts and their purpose/],
    ["transport_security_tls_certificate", /certificate or chain configuration/],
    ["california_rights_disclosure_not_observed", /which California privacy rights apply/],
    ["text_alternative_accessibility_issue", /text alternatives.*decorative images/],
  ] as const;
  for (const [id, expected] of cases) for (const severity of ["critical", "high", "medium", "low"] as const) {
    const result = buildAssessmentHighlightsPresentation([{id, severity, title:"Projected issue", summary:"Observed in this visit; wider scope is unverified.",
      correctionSteps:["Review the supporting evidence and recommended fixes in Detailed evidence."]}], page);
    assert.match(result.text, expected);
    assert.match(result.text, /wider scope is unverified/);
    assert.doesNotMatch(result.text, /Review the supporting evidence/);
    assert.ok(result.text.length <= 430);
    assert.equal(result.links.length, 1);
  }
});

test("a specific later correction step replaces referral boilerplate without clipping qualifications", () => {
  const action = "Check the request destination; disable the integration only if the destination is unauthorized.";
  const result = buildAssessmentHighlightsPresentation([{id:"future_finding", title:"Destination review", summary:"Ownership is unverified.",
    correctionSteps:["Review the evidence.", action]}], page);
  assert.ok(result.text.includes(action));
  assert.match(result.text, /Ownership is unverified/);
  assert.doesNotMatch(result.text, /Review the evidence/);
});

test("an action already included in the summary is not repeated", () => {
  const action = "Correct the setting, then retest.";
  const copy = buildAssessmentHighlights([{title:"Setting issue", summary:`The setting is inconsistent. ${action}`, correctionSteps:[action]}], page);
  assert.equal(copy.split(action).length - 1, 1);
});

test("retained storage examples yield to purpose qualification and a conditional next step", () => {
  const result = buildAssessmentHighlightsPresentation([{id:"regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",title:"Storage classification review",
    summary:"Cookies or browser storage were retained before consent. First retained item: example (example.com): unknown, first observed 2.992s after scan start. Essentiality was not confirmed for every item.",
    correctionSteps:["Defer analytics cookies until explicit user consent is obtained."]}],page);
  assert.match(result.text,/Essentiality was not confirmed for every item/);
  assert.match(result.text,/Check each retained item's purpose; defer confirmed non-essential storage/);
  assert.doesNotMatch(result.text,/Defer analytics cookies/);
});

test("known embed checklist boilerplate becomes a purpose-bound next step without classifying tracking", () => {
  const result = buildAssessmentHighlightsPresentation([{id:"regulatory_gap__gdpr_eprivacy__third_party_iframe_pre_consent",title:"Third-party embeds before consent",
    summary:"Known 3rd party iframe embeds were retained before a recorded consent action on the scanned page. This establishes pre-consent embedded-service activity, not tracking classification by itself.",
    correctionSteps:["Review the retained checklist evidence, confirm whether the row is applicable to the site, and address the underlying implementation or disclosure gap if confirmed."]}],page);
  assert.match(result.text,/this alone does not establish tracking/);
  assert.match(result.text,/Check the frame's purpose and consent requirements/);
  assert.doesNotMatch(result.text,/Review the retained checklist/);
});

test("GPC next step responds to an already-set opt-out only with positive collection", () => {
  const base = {id:"gpc_response",title:"GPC review",summary:"GPC delivery was verified on the page request and browser setting. CMP-recorded sale state: opted out; sharing state: opted out. Retained GPC request samples include 2 classified advertising, marketing, analytics or replay requests, including 1 collection requests."};
  assert.match(buildAssessmentHighlights([base],page),/Check the collected data's purpose and whether the recorded opt-out applies/);
  assert.doesNotMatch(buildAssessmentHighlights([{...base,summary:base.summary.replace('including 1 collection','including 0 collection')}],page),/collection continued/);
});

test("grouped nested controls and contrast retain observed facts with matching fixes under the cap", () => {
  const result=buildAssessmentHighlightsPresentation([{id:"accessibility_priority_group",title:"Accessibility issues",evidenceJson:{findings:[
    {id:"keyboard_navigation_accessibility_issue",title:"Keyboard navigation accessibility issue",summary:"Automated accessibility checks found failures on 1 tested page (1 element failure). Interactive controls were nested inside other interactive controls."},
    {id:"visual_contrast_accessibility_issue",title:"Visual contrast accessibility issue",summary:"Low-contrast text was detected on 1 tested page (4 element failures). Retained examples measured 4.44:1 (required 4.5:1); 2.92:1 (required 4.5:1)."}
  ]}}],page);
  assert.match(result.text,/Interactive controls were nested/);
  assert.match(result.text,/Low-contrast text was detected/);
  assert.match(result.text,/Separate the flagged nested interactive controls/);
  assert.ok(result.text.length<=430);
  assert.equal(result.links[0]?.targetId,"accessibility-evidence");
});
