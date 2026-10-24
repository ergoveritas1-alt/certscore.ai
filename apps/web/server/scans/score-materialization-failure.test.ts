import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ScanReportProjectionTooLargeError } from "./scan-report-projection-contract";
import { classifyScoreMaterializationFailure } from "./score-materialization-failure";
import { serializeScoreMaterializationFailure } from "./score-materialization-failure";
import { ReportPublicationInvariantError, assertReportablePostureScores } from "./report-publication-invariant";

test("oversized canonical projections fail terminally instead of retrying", () => {
  const error = new ScanReportProjectionTooLargeError({
    maxBytes: 6 * 1024 * 1024,
    scanId: "2f82eaa3-dd92-42ff-bd43-31a04b7ae207",
    sizeBytes: 11_189_950,
  });

  assert.deepEqual(classifyScoreMaterializationFailure(error), {
    code: "projection_too_large",
    diagnostic: "projection_too_large",
    retryable: false,
  });
});

test("schema contract failures are terminal and expose only bounded diagnostics", () => {
  let validationError: unknown;
  try {
    z.string().max(2).parse("overlong-sensitive-value");
  } catch (error) {
    validationError = error;
  }
  const wrapped = new Error("Score lifecycle canonical-projection failed.", {
    cause: validationError,
  });

  assert.deepEqual(classifyScoreMaterializationFailure(wrapped), {
    code: "contract_validation_failed",
    diagnostic: "contract_validation_failed:canonical-projection",
    retryable: false,
    details: {version:"report-publication-failure.v1",phase:"canonical-projection",issues:[{code:"too_big",path:""}]},
  });
});

test("infrastructure and unknown failures remain retryable", () => {
  assert.deepEqual(classifyScoreMaterializationFailure(
    new Error("Score lifecycle legacy-persistence failed: connection reset"),
  ), {
    code: "materialization_failed_transient",
    diagnostic: "materialization_failed_transient:legacy-persistence",
    retryable: true,
  });
});

test("canonical projection finalization requests a bounded fast retry", () => {
  const error = Object.assign(new Error("Canonical report projection is not ready."), {
    name: "CanonicalScanReportProjectionNotReadyError",
    reason: "canonical_findings_not_ready",
  });

  assert.deepEqual(classifyScoreMaterializationFailure(error), {
    code: "materialization_not_ready",
    diagnostic: "materialization_not_ready:canonical_findings_not_ready",
    retryAfterSeconds: 1,
    retryable: true,
  });
});

test("canonical projection retry diagnostics discard unbounded reasons", () => {
  const error = Object.assign(new Error("Canonical report projection is not ready."), {
    name: "CanonicalScanReportProjectionNotReadyError",
    reason: "sensitive reason with spaces and an unbounded payload",
  });

  assert.deepEqual(classifyScoreMaterializationFailure(error), {
    code: "materialization_not_ready",
    diagnostic: "materialization_not_ready:unspecified",
    retryAfterSeconds: 1,
    retryable: true,
  });
});

test("stale projection sources use the bounded fast retry path", () => {
  const error = Object.assign(new Error("Refusing to publish stale report projection source."), {
    name: "StaleScanReportProjectionSourceError",
  });

  assert.deepEqual(classifyScoreMaterializationFailure(error), {
    code: "materialization_not_ready",
    diagnostic: "materialization_not_ready:stale_projection_source",
    retryAfterSeconds: 1,
    retryable: true,
  });
});

test("typed publication invariants are terminal with bounded value-free internal diagnostics", () => {
  const error = new ReportPublicationInvariantError("consent_assessment_invalid", "consent_assessment", {
    message: "sensitive-user@example.test https://private.test/?token=secret",
    issues: Array.from({length:20},()=>({code:"custom",path:["californiaPrivacyReview","documentUrl","https://private.test/?token=secret"],message:"private details"})),
  });
  const result=classifyScoreMaterializationFailure(new Error("wrapper",{cause:error}));
  assert.equal(result.retryable,false);
  assert.equal(result.code,"publication_invariant_failed");
  assert.equal(result.details?.phase,"consent_assessment");
  assert.equal(result.details?.issues[0]?.path,"californiaPrivacyReview.documentUrl.?");
  assert.ok(result.details!.issues.length<=6);
  const retained=serializeScoreMaterializationFailure(result);
  assert.ok(retained.length<=500);assert.doesNotThrow(()=>JSON.parse(retained));
  assert.doesNotMatch(retained,/secret|private|sensitive-user|example.test/);
});

test("storage/network failures and stale/not-ready races stay retryable", () => {
  for(const code of ["ECONNRESET","ETIMEDOUT","ENOTFOUND","40001","40P01"]){
    const result=classifyScoreMaterializationFailure(Object.assign(new Error("infrastructure failure"),{code}));
    assert.equal(result.retryable,true,code);
  }
});


test("new reports require both real posture scores without rejecting valid independent routes", () => {
  for (const [eu,california] of [[0,0],[100,100],[48,76],[74,69],[80,77]]) {
    assert.doesNotThrow(()=>assertReportablePostureScores({eu:eu!,california:california!,noGo:false}));
  }
  for (const [eu,california] of [[86,null],[null,90],[null,null],[NaN,90],[101,90],[50,1.5]]) {
    assert.throws(()=>assertReportablePostureScores({eu:eu!,california:california!,noGo:false}),error=>{
      const failure=classifyScoreMaterializationFailure(error);
      assert.equal(failure.code,"publication_invariant_failed");assert.equal(failure.retryable,false);
      assert.equal(failure.details?.phase,"score_availability");return true;
    });
  }
  assert.doesNotThrow(()=>assertReportablePostureScores({eu:null,california:null,noGo:true}));
});
