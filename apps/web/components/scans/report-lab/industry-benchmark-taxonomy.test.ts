import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIndustryBenchmarkSlug } from "./industry-benchmark-taxonomy";

test("normalizes detailed production industry labels into stable benchmark cohorts", () => {
  assert.equal(normalizeIndustryBenchmarkSlug("News & Media (Digital Journalism)"), "media");
  assert.equal(normalizeIndustryBenchmarkSlug("SaaS / web application"), "technology");
  assert.equal(normalizeIndustryBenchmarkSlug("Veterinary / Animal healthcare (Equine clinic)"), "health");
  assert.equal(normalizeIndustryBenchmarkSlug("E-commerce / Online marketplace"), "retail");
  assert.equal(normalizeIndustryBenchmarkSlug("Higher Education / Public University"), "education");
  assert.equal(normalizeIndustryBenchmarkSlug("Social media / visual discovery (Pinterest)"), "social");
  assert.equal(normalizeIndustryBenchmarkSlug("Government health / public information"), "government");
});

test("keeps unmatched detailed labels out of a misleading industry cohort", () => {
  assert.equal(normalizeIndustryBenchmarkSlug("Other"), null);
  assert.equal(normalizeIndustryBenchmarkSlug("Legal/Compliance & Risk Advisory"), null);
  assert.equal(normalizeIndustryBenchmarkSlug(null), null);
});
