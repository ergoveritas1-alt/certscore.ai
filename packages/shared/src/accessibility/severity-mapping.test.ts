import assert from "node:assert/strict";
import test from "node:test";
import { mapAxeImpactToSeverity, mapAxeImpactToConfidence } from "./severity-mapping";

test("mapAxeImpactToSeverity maps axe impacts to CertScore severities", () => {
  assert.equal(mapAxeImpactToSeverity("critical"), "critical");
  assert.equal(mapAxeImpactToSeverity("serious"), "high");
  assert.equal(mapAxeImpactToSeverity("moderate"), "medium");
  assert.equal(mapAxeImpactToSeverity("minor"), "low");
  assert.equal(mapAxeImpactToSeverity("unknown"), "medium");
  assert.equal(mapAxeImpactToSeverity(null), "medium");
  assert.equal(mapAxeImpactToSeverity(undefined), "medium");
});

test("mapAxeImpactToConfidence returns strong for serious/critical with nodes", () => {
  assert.equal(mapAxeImpactToConfidence("critical", 1), "strong");
  assert.equal(mapAxeImpactToConfidence("serious", 5), "strong");
  assert.equal(mapAxeImpactToConfidence("critical", 0), "review");
  assert.equal(mapAxeImpactToConfidence("serious", 0), "review");
});

test("mapAxeImpactToConfidence returns good for moderate/minor with nodes", () => {
  assert.equal(mapAxeImpactToConfidence("moderate", 1), "good");
  assert.equal(mapAxeImpactToConfidence("minor", 3), "good");
  assert.equal(mapAxeImpactToConfidence("moderate", 0), "review");
  assert.equal(mapAxeImpactToConfidence("minor", 0), "review");
});

test("mapAxeImpactToConfidence returns review for unknown impact", () => {
  assert.equal(mapAxeImpactToConfidence("unknown", 1), "review");
  assert.equal(mapAxeImpactToConfidence(null, 1), "review");
});
