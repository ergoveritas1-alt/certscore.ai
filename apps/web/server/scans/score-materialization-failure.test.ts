import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { classifyScoreMaterializationFailure } from "./score-materialization-failure";

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
