/** Deterministic test/development fixture only. Never a production evidence source. */
import {createHash} from "node:crypto";
import {type CanonicalEvidenceBundle, policyTextEvidenceProjectionSchema} from "@certscore/contracts";
export const CA_FIXTURE_URL = "https://california-fixture.test/";
export const CA_FIXTURE_SOURCE = {verificationStatus:"verified",sha256:"a".repeat(64)};
export const CA_FIXTURE_POLICY = "California Privacy Notice. Categories of personal information include identifiers and contact details. We use personal information to provide requested services. We retain personal information for as long as necessary to fulfill those purposes. You have the right to know what personal information we collect. You have the right to delete your personal information. You have the right to correct inaccurate personal information. We will not discriminate against you for exercising your privacy rights. To exercise your privacy rights, contact privacy@example.test or submit our online form. We do not sell or share personal information.";
export function californiaCoverageFixture(text=CA_FIXTURE_POLICY) {
  const url=CA_FIXTURE_URL;
  const inspection = {contractVersion:"certscore.privacy-choice-inspection.v4",homepageAccessPolicy:"representative_homepage.v1",
    documentUrl:url,capturedAt:"2026-10-17T12:00:01.000Z",sourceHash:"b".repeat(64),scope:"rendered_named_links_and_buttons",coverage:"complete",
    namedChoiceCandidateCount:0,unnamedControlCount:0,hiddenUnnamedControlCount:0,candidateEnumerationTruncated:false,
    uninspectedFrameCount:0,uninspectedShadowRootCount:0,supportedDocumentLanguage:true,representativeDocument:true,documentStable:true,
    frameCount:0,inspectedSameOriginFrameCount:0,hiddenUninspectedFrameCount:0,inaccessibleFrameCount:0,unreadyFrameCount:0,
    unprojectableFrameCount:0,frameBudgetLimitedCount:0,namedFrameChoiceCandidateCount:0,frameInspectionWorkMs:0,frameProofWorkMs:0};
  const policySurfaceObservations = ["policy","notice"].map(id=>({observationId:id,surfaceType:id==="notice"?"notice_at_collection":"privacy_policy",
    url:`${url}${id}`,normalizedUrl:`${url}${id}`,finalUrl:`${url}${id}`,linkText:id==="notice"?"Notice at Collection":"Privacy Policy",
    linkSourcePageUrl:url,linkVisibility:"visible",accessibleNameSource:"text",directlyLinkedFromScannedPage:true,linkObservationState:"observed",
    discoveryMethod:"footer_link",classifierProvenance:"privacy_surface_classifier.v1",status:"fetched",documentFetchState:"fetched",documentEvaluationState:"usable",documentRole:"policy_document",
    targetRelationship:"target_controller",textExcerpt:text,contentCoverage:{status:"complete",sourceTextChars:text.length,extractedSectionCount:1,retainedSectionCount:1,retainedTableRowCount:0,limitationKeys:[]}}));
  const bundle={scanId:"california-local-fixture",startedAt:"2026-10-17T12:00:00.000Z",completedAt:"2026-10-17T12:00:02.000Z",
    modulesRun:[{moduleName:"preConsentRuntimeScanner",status:"completed",startedAt:"2026-10-17T12:00:00.000Z"}],
    runtimeCoverage:{coverageStatus:"usable"},
    collectionSurfaceInventory:{contractVersion:"certscore.collection-surface-inventory.v1",inventoryId:"collection-fixture",sourceLane:"runtime_evidence",sourceScanner:"preConsentRuntimeScanner",
      scenario:"pre_consent",observedAtMs:500,consentStateAtTime:"pre_consent",pageUrl:url,forms:[],evidenceRefs:[{refId:"collection-fixture"}],confidence:1,directVsInferred:"direct",
      coverage:{status:"complete",documentScope:"main_document",interactionMode:"none",candidateFormCount:0,retainedFormCount:0,candidateFieldCount:0,retainedFieldCount:0,
        inspectedFormCandidateCount:0,inspectedFieldCandidateCount:0,candidateScanTruncated:false,retentionTruncated:false,reasonCodes:[]}},
    policySurfaceInspection:{californiaReviewPolicy:"california-privacy-review.v2",privacyChoiceInspection:inspection},
    policySurfaceObservations,domSnapshots:[]} as unknown as CanonicalEvidenceBundle;
  const hash=createHash("sha256").update(text).digest("hex");
  const projection=policyTextEvidenceProjectionSchema.parse({contractVersion:"certscore.policy-text-evidence-projection.v1",
    generatedAt:bundle.completedAt,scanId:bundle.scanId,sourceBundle:{...CA_FIXTURE_SOURCE,schemaVersion:"fixture"},projectionStatus:"verified_complete",
    documents:policySurfaceObservations.map(surface=>({observationId:surface.observationId,artifactId:surface.observationId,
      artifactSha256:hash,artifactSizeBytes:Buffer.byteLength(text),artifactVerificationStatus:"verified",requestedUrl:surface.url,finalUrl:surface.url,
      redirectChain:[],documentFormat:"text",documentFetchState:"fetched",documentEvaluationState:"usable",documentRole:"policy_document",targetRelationship:"target_controller",
      contentCoverage:surface.contentCoverage,documentTextCoverage:{status:"complete",sourceTextChars:text.length,retainedTextChars:text.length,limitationKeys:[]},
      retainedTextChars:text.length,retainedTextSha256:hash,extractionStatus:"complete",limitationKeys:[]}))});
  return {bundle,policyEvidence:{projection,texts:policySurfaceObservations.map(surface=>({observationId:surface.observationId,text}))}};
}
