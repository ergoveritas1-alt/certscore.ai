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
