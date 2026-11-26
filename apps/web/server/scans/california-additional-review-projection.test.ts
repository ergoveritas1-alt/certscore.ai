import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIFORNIA_ADDITIONAL_REVIEW_VERSION, CALIFORNIA_CHOICE_FRICTION_FINDING,
  CALIFORNIA_COLLECTION_NOTICE_FINDING, CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING,
  californiaPrivacyReviewSchema, deriveConsentControlAssessment, derivePolicySurfaceInspectionOutcome,
  type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { projectReportPriorityFindings } from "../../lib/scans/report-priority-projection";
import { selectRegulatoryReview } from "../../lib/scans/regulatory-review-catalog";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";

const notice = "Notice at Collection. We collect your email address to respond to your request.";
const mandate = "To opt out of the sale or sharing of your personal information, you must create an account.";
const recipient = "https://analytics.example.test/collection";
const version = "certscore.california-privacy-review.v10";

function fixture(text = notice) {
  const fixture = californiaCoverageFixture(text);
  const bundle = fixture.bundle;
  bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  bundle.policySurfaceInspection!.californiaAdditionalReview = CALIFORNIA_ADDITIONAL_REVIEW_VERSION;
  bundle.policySurfaceObservations.forEach(surface => { surface.documentLanguage = "en"; });
  bundle.collectionSurfaceInventory!.forms = [{
    formRef: "contact", pageUrl: CA_FIXTURE_URL, structure: "native_form", surfaceType: "contact",
    method: "post", actionRelationship: "self", candidateFieldCount: 1, retainedFieldCount: 1,
    fieldsTruncated: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [{refId:"form-contact"}],
    fields: [{fieldRef:"email", elementType:"input", inputType:"email", semanticCategory:"email", label:"Email",
      required:true, disabled:false, readOnly:false, confidence:1, directVsInferred:"direct", evidenceRefs:[]}],
    privacyDisclosure: {version:2, truncated:false, excerpts: [{
      text:"Notice at Collection", association:"adjacent_notice", links:[{label:"Notice at Collection", url:CA_FIXTURE_URL+"notice"}],
    }]},
  }];
  Object.assign(bundle.collectionSurfaceInventory!.coverage, {
    candidateFormCount:1, retainedFormCount:1, candidateFieldCount:1, retainedFieldCount:1,
    inspectedFormCandidateCount:1, inspectedFieldCandidateCount:1,
  });
  return fixture;
}

function review(input: ReturnType<typeof fixture>, source = CA_FIXTURE_SOURCE) {
  const result = projectCaliforniaPrivacyReview(input.bundle, source, CA_FIXTURE_URL, input.policyEvidence);
  assert.equal(result?.contractVersion, version);
  if (result?.contractVersion !== version) throw new Error("Expected a current California review");
  return result;
}

function findings(assessment: ReturnType<typeof review>) {
  const parent = deriveConsentControlAssessment({scan:{scanId:assessment.scanId, finalUrl:assessment.documentUrl}});
  parent.californiaPrivacyReview = assessment;
  return buildUnifiedFindingDisplayPackets({ runtimeArtifacts: {consentControlAssessment:parent},
    reviewFindingCandidates:[], validationFindings:[], validationFindingLookup:new Map() });
}

function priorityRows(packets: ReturnType<typeof findings>, focus: "ccpa_cpra" | "gdpr_eprivacy" = "ccpa_cpra") {
  return selectRegulatoryReview(projectReportPriorityFindings([], packets), focus).topIssues;
}

test("complete linked retention omission gets one California score and priority finding", () => {
  const data = fixture();
  const assessment = review(data);
  assert.equal(assessment.additionalReview?.notice?.issue, "retention_missing_from_reviewed_notice");
  const packets = findings(assessment);
  const score = deriveCaliforniaRegulatoryScore({assessment, unifiedFindings:[...packets, ...packets], checklistRows:[]});
  assert.equal(score.deductions.filter(row => row.findingId === CALIFORNIA_COLLECTION_NOTICE_FINDING).length, 1);
  assert.equal(score.deductions.find(row => row.findingId === CALIFORNIA_COLLECTION_NOTICE_FINDING)?.points, 10);
  assert.ok(priorityRows(packets).some(row => row.id === CALIFORNIA_COLLECTION_NOTICE_FINDING));
  assert.ok(!priorityRows(packets, "gdpr_eprivacy").some(row => row.id === CALIFORNIA_COLLECTION_NOTICE_FINDING));

  const stale = structuredClone(packets);
  const staleFinding = stale.find(row => row.unifiedFindingId === CALIFORNIA_COLLECTION_NOTICE_FINDING);
  assert.ok(staleFinding?.details?.family === "california_privacy_review");
  staleFinding.details.projection.scanId = "different-scan";
  assert.ok(!deriveCaliforniaRegulatoryScore({assessment, unifiedFindings:stale, checklistRows:[]})
    .deductions.some(row => row.findingId === CALIFORNIA_COLLECTION_NOTICE_FINDING));
});

test("retention criteria, incomplete notice, unrelated and legacy captures stay neutral", () => {
  assert.ok(!review(fixture(notice + " We erase this information when your request is resolved.")).additionalReview?.notice);
  const data = fixture();
  const form = data.bundle.collectionSurfaceInventory!.forms[0]!;
  form.privacyDisclosure!.truncated = true;
  assert.ok(!review(data).additionalReview?.notice);
  form.privacyDisclosure!.truncated = false;
  form.privacyDisclosure!.excerpts[0]!.links[0]!.url += "#privacy";
  assert.ok(!review(data).additionalReview?.notice);
  form.privacyDisclosure!.excerpts[0]!.links[0]!.url = CA_FIXTURE_URL + "notice";
  delete data.bundle.policySurfaceInspection!.californiaAdditionalReview;
  assert.ok(!review(data).additionalReview);
});

test("a completed empty collection and policy inspection shares the existing missing-policy deduction", () => {
  const data = fixture();
  data.bundle.policySurfaceObservations = [];
  data.bundle.collectionSurfaceInventory!.forms[0]!.privacyDisclosure!.excerpts = [];
  data.bundle.policySurfaceInspection = derivePolicySurfaceInspectionOutcome({
    normalizedUrl:CA_FIXTURE_URL, californiaReviewPolicy:"california-privacy-review.v10",
    californiaAdditionalReview:CALIFORNIA_ADDITIONAL_REVIEW_VERSION,
    modulesRun:[{moduleName:"policySurfaceScanner",status:"completed"}] as CanonicalEvidenceBundle["modulesRun"],
    negativeSearchEvidence:{contractVersion:"certscore.policy-negative-search.v1",requestedUrl:CA_FIXTURE_URL,
      staticDocumentUrl:CA_FIXTURE_URL,renderedDocumentUrl:CA_FIXTURE_URL,staticDocumentHash:"d".repeat(64),
      renderedInspectionHash:"e".repeat(64),staticInspectionComplete:true,renderedInspectionComplete:true,representativeDocuments:true,
      observedPrivacyCandidateCount:0,uninspectedFrameCount:0,uninspectedShadowRootCount:0,candidateEnumerationTruncated:false},
  });
  const assessment = review(data);
  assert.equal(assessment.additionalReview?.notice?.issue, "no_notice_in_completed_inspection");
  const score = deriveCaliforniaRegulatoryScore({assessment, unifiedFindings:findings(assessment),
    checklistRows:[{id:"privacy_notice_availability",assessmentStatus:"gap_observed",evidenceState:"not_observed",
      criticalEvidence:{retainedEvidence:{policySurfaceInspection:data.bundle.policySurfaceInspection}}}] as unknown as Parameters<typeof deriveCaliforniaRegulatoryScore>[0]["checklistRows"]});
  assert.equal(score.deductions.filter(row => /notice|privacy_notice/.test(row.policyKey)).length, 1);
  assert.ok(!score.deductions.some(row => row.findingId === CALIFORNIA_COLLECTION_NOTICE_FINDING));
});

test("an explicit account requirement on the observed opt-out path is reportable and scored once", () => {
  const data = fixture();
  const destination = CA_FIXTURE_URL + "opt-out";
  const surface: CanonicalEvidenceBundle["policySurfaceObservations"][number] = {...data.bundle.policySurfaceObservations[0]!,
    observationId:"opt-out",url:destination,normalizedUrl:destination,finalUrl:destination,
    surfaceType:"do_not_sell_or_share",linkText:"Do Not Sell or Share My Personal Information",
    documentRole:"unknown",status:"failed",documentEvaluationState:"insufficient",fetchFailureReason:"insufficient_policy_text",
    httpStatus:200,californiaChoiceBarrier:{sourceDocumentUrl:CA_FIXTURE_URL,destinationUrl:destination,
      textSha256:"7".repeat(64),scope:"sale_or_sharing",excerpt:mandate},
  };
  data.bundle.policySurfaceObservations.push(surface);
  data.bundle.policySurfaceInspection!.privacyChoiceInspection!.namedChoiceCandidateCount = 1;
  const assessment = review(data);
  assert.equal(assessment.additionalReview?.choiceFriction?.scope, "sale_or_sharing");
  const packets = findings(assessment);
  const points = deriveCaliforniaRegulatoryScore({assessment, unifiedFindings:[...packets, ...packets], checklistRows:[]}).deductions;
  assert.deepEqual(points.filter(row => row.findingId === CALIFORNIA_CHOICE_FRICTION_FINDING).map(row => row.points), [8]);
  assert.ok(priorityRows(packets).some(row => row.id === CALIFORNIA_CHOICE_FRICTION_FINDING));
  assert.ok(!assessment.reviewCoverage.sourceDocuments.some(row => row.url === surface.finalUrl));
  surface.linkVisibility = "hidden";
  assert.ok(!review(data).additionalReview?.choiceFriction);
  surface.linkVisibility = "visible";
  surface.finalUrl = CA_FIXTURE_URL + "other";
  assert.ok(!review(data).additionalReview?.choiceFriction);
  surface.finalUrl = destination;
  if (!surface.californiaChoiceBarrier) throw new Error("Expected retained destination proof");
  surface.californiaChoiceBarrier.scope = "sensitive_information_limit";
  surface.californiaChoiceBarrier.excerpt = "To limit the use and disclosure of your sensitive personal information, you must create an account.";
  assert.ok(!review(data).additionalReview?.choiceFriction);
  surface.surfaceType = "your_privacy_choices";
  surface.linkText = "Your Privacy Choices";
  assert.equal(review(data).additionalReview?.choiceFriction?.scope, "sensitive_information_limit");
});

test("an exact sensitive form-field transmission with a verified success is a score-neutral California review", () => {
  const data = fixture();
  const bundle = data.bundle;
  const fieldRef = "form_trace:field:0:0", eventRef = "form_trace:event:0";
  const hash = "f".repeat(64);
  bundle.formDestinationTrace = {
    contractVersion:"certscore.form-destination-trace.v1",mode:"passive",
    events:[{evidenceRef:eventRef,kind:"input",observedAtMs:100,documentUrl:CA_FIXTURE_URL,
      documentToken:"loader-fixture",formIndex:0,actionUrl:CA_FIXTURE_URL,actionDomain:"california-fixture.test",
      fields:[{evidenceRef:fieldRef,name:"diagnosis",category:"health",personal:true,valueHmac:hash}]}],
    requests:[{evidenceRef:"form_trace:request:0",networkRequestId:"req-1",eventRef,observedAtMs:200,
      url:recipient,domain:"example.test",method:"POST",party:"third_party",outsideDeclaredDestination:true,status:"response_observed",
      relation:"exact_field_value_match",matches:[{fieldRef,valueHmac:hash,location:"body"}]}],
    coverage:{truncated:false,unsupportedPayloads:0,scope:"main_document_existing_window",activeSubmission:false},
  };
  bundle.runtimeMetadataSnapshots = [{url:CA_FIXTURE_URL,documentIdentity:{token:"loader-fixture"}}] as CanonicalEvidenceBundle["runtimeMetadataSnapshots"];
  bundle.networkEvents = [{requestId:"req-1",url:recipient,requestUrl:recipient,method:"POST",timestampMs:200,documentUrl:CA_FIXTURE_URL}] as CanonicalEvidenceBundle["networkEvents"];
  bundle.networkResponseEvents = [{requestId:"req-1",responseUrl:recipient,timestampMs:250,documentUrl:CA_FIXTURE_URL,
    status:204,directVsInferred:"direct"}] as CanonicalEvidenceBundle["networkResponseEvents"];
  const assessment = review(data);
  assert.equal(assessment.additionalReview?.sensitiveTransmission?.[0]?.category, "health");
  assert.ok(!JSON.stringify(assessment.additionalReview).includes(hash));
  const packets = findings(assessment);
  assert.equal(priorityRows(packets).find(row => row.id === CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING)?.status, "Review");
  assert.ok(!deriveCaliforniaRegulatoryScore({assessment, unifiedFindings:packets, checklistRows:[]})
    .deductions.some(row => row.findingId === CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING));
  assert.equal(californiaPrivacyReviewSchema.safeParse({...assessment, additionalReview:{...assessment.additionalReview, scanId:"other"}}).success, false);
  bundle.networkResponseEvents[0]!.status = 403;
  assert.ok(!review(data).additionalReview?.sensitiveTransmission);
});
