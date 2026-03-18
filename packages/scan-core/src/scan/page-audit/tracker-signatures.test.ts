import assert from "node:assert/strict";
import test from "node:test";
import { TRACKER_SIGNATURES } from "./tracker-signatures";

test("TRACKER_SIGNATURES inherits expanded vendor coverage from shared registry", () => {
  const byKey = new Map(TRACKER_SIGNATURES.map((signature) => [signature.key, signature]));

  assert.equal(byKey.get("adobe_analytics")?.displayName, "Adobe Analytics");
  assert.equal(byKey.get("segment")?.displayName, "Segment");
  assert.equal(byKey.get("fullstory")?.displayName, "FullStory");
  assert.equal(byKey.get("posthog")?.displayName, "PostHog");
  assert.equal(byKey.get("rudderstack")?.displayName, "RudderStack");
});

test("TRACKER_SIGNATURES assigns heavier default severity to higher-risk tracker categories", () => {
  const byKey = new Map(TRACKER_SIGNATURES.map((signature) => [signature.key, signature]));

  assert.equal(byKey.get("meta_pixel")?.defaultSeverity, "medium");
  assert.equal(byKey.get("fullstory")?.defaultSeverity, "medium");
  assert.equal(byKey.get("google_analytics")?.defaultSeverity, "low");
  assert.equal(byKey.get("tealium")?.category, "tag_manager");
});
