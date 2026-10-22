import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {policySurfaceObservationSchema} from "@certscore/contracts";
import {gpcProductionRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import {afterRejectClickProjection} from "./test-fixtures/after-reject-scoring";
import {withPropertySaleSharingSource} from "./property-sale-sharing-source";
test("property corroboration projection requires verified source bytes and the same scan and target",()=>{
 const bundle=gpcProductionRuntimeFixture(),p=afterRejectClickProjection();
 const target=createHash("sha256").update(bundle.url).digest("hex");
 p.sourceIdentity={policyVersion:"post_reject_source_identity.v1",scanId:bundle.scanId,targetSha256:target};p.actionControlProof!.authorizedTargetSha256=target;
 bundle.policySurfaceObservations=[policySurfaceObservationSchema.parse({observationId:"privacy",surfaceType:"privacy_policy",url:bundle.url+"privacy",discoveryMethod:"footer_link",status:"fetched",confidence:.98,
 targetRelationship:"target_controller",ownershipConfidence:.98,documentEvaluationState:"usable",documentRole:"policy_document",documentFetchState:"fetched",httpStatus:200,documentLanguage:"en",textExcerpt:"We use Google Analytics property G-ABC123 for remarketing."})];
 const source={verificationStatus:"verified",sha256:"b".repeat(64)};
 assert.ok(withPropertySaleSharingSource(p,bundle,source)?.propertySaleSharingSource);
 assert.equal(withPropertySaleSharingSource(p,bundle,{...source,verificationStatus:"local_unverified"}),p);
 bundle.scanId="other-scan";assert.equal(withPropertySaleSharingSource(p,bundle,source),p);
 bundle.scanId=p.sourceIdentity.scanId;bundle.url="https://other.test/";assert.equal(withPropertySaleSharingSource(p,bundle,source),p);
});
