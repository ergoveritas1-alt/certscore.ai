import assert from "node:assert/strict";
import test from "node:test";
import { classifyLambdaScannerFleet, type LambdaScannerRegionStatus } from "./lambda-scanner-health-core";

function region(status: LambdaScannerRegionStatus) {
  return { status };
}

test("classifies a fully healthy Lambda fleet", () => {
  assert.equal(classifyLambdaScannerFleet([region("healthy"), region("healthy"), region("healthy")]), "healthy");
});

test("classifies one degraded region without declaring scanning unavailable", () => {
  assert.equal(classifyLambdaScannerFleet([region("healthy"), region("unavailable"), region("healthy")]), "degraded");
});

test("classifies all unavailable regions", () => {
  assert.equal(classifyLambdaScannerFleet([region("unavailable"), region("unavailable"), region("unavailable")]), "unavailable");
});

test("classifies an unavailable AWS status lookup as unknown", () => {
  assert.equal(classifyLambdaScannerFleet([region("unknown"), region("unknown"), region("unknown")]), "unknown");
});
