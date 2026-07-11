import assert from "node:assert/strict";
import test from "node:test";
import { classifyLambdaScannerFleet, isLambdaScannerHealthStale, type LambdaScannerRegionStatus } from "./lambda-scanner-health-core";

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

test("marks health older than the bounded cache window as stale", () => {
  const now = Date.parse("2026-07-11T20:00:00.000Z");
  assert.equal(isLambdaScannerHealthStale("2026-07-11T19:59:00.000Z", now), false);
  assert.equal(isLambdaScannerHealthStale("2026-07-11T19:57:59.000Z", now), true);
  assert.equal(isLambdaScannerHealthStale("not-a-date", now), true);
});
