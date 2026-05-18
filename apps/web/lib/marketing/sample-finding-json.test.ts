import assert from "node:assert/strict";
import test from "node:test";

import { getGuideSampleFindings } from "./sample-finding-json";

test("guide sample findings resolve from the guide slug instead of falling back to pre-consent content", () => {
  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/rtb-cookie-syncing",
      title: "RTB cookie syncing: what it means and how to review it"
    }).map((sample) => sample.findingId),
    ["rtb_cookie_sync_observed"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/session-replay-risk",
      title: "Session replay risk: what website owners should review"
    }).map((sample) => sample.findingId),
    ["session_recording_services_detected"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/accessibility-homepage-signals",
      title: "Accessibility homepage signals: what automated scans can surface"
    }).map((sample) => sample.findingId),
    ["accessibility_risk_score"]
  );
});
