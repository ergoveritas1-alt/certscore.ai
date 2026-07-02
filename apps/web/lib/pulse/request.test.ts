import assert from "node:assert/strict";
import test from "node:test";
import { normalizePulseUrl, parsePulseDetail, parsePulseFormat, parsePulseFreshness, parsePulseWaitSeconds } from "./request";

test("Pulse request parsing applies canonical defaults and wait bounds", () => {
  assert.equal(parsePulseFormat(null), "json");
  assert.equal(parsePulseFormat("markdown"), "markdown");
  assert.equal(parsePulseDetail(null), "summary");
  assert.equal(parsePulseDetail("quick"), "tiny");
  assert.equal(parsePulseDetail("tiny"), "tiny");
  assert.equal(parsePulseDetail("standard"), "standard");
  assert.equal(parsePulseDetail("full"), "full");
  assert.equal(parsePulseDetail("summary"), "summary");
  assert.equal(parsePulseDetail("evidence"), "evidence");
  assert.equal(parsePulseFreshness(null), "latest");
  assert.equal(parsePulseFreshness("refresh"), "refresh");
  assert.equal(parsePulseWaitSeconds("999"), 80);
  assert.equal(parsePulseWaitSeconds("-10"), 0);
});

test("Pulse URL normalization accepts domains and rejects invalid input", () => {
  const normalized = normalizePulseUrl("example.com");
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.normalizedDomain, "example.com");
    assert.equal(normalized.normalizedUrl, "https://example.com/");
  }

  assert.equal(normalizePulseUrl("not a url").ok, false);
});
