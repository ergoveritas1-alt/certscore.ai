import assert from "node:assert/strict";
import test from "node:test";
import { parseProductAnalyticsPayload } from "./contract";
import { operationalActivityPayload } from "./operational-activity";
import { scanFormFailureEvent, SCAN_FORM_ID } from "./scan-form-events";

test("bounded scan failures survive the existing operational contract without form contents", () => {
  for (const reason of ["website_required", "search_results_confirmation_required", "server_rejected"] as const) {
    const payload = parseProductAnalyticsPayload({ ...scanFormFailureEvent(reason), route: "/app/domains?private=value" });
    assert.ok(payload);
    const retained = operationalActivityPayload(payload);
    assert.equal(retained.formId, SCAN_FORM_ID);
    assert.equal(retained.feature, `scan_validation:${reason}`);
    assert.equal(retained.route, "/app/domains");
    assert.equal(retained.eventName, "form_failed");
    assert.equal(retained.outcome, "failure");
    assert.equal(retained.actorId, undefined);
    assert.equal(retained.sessionId, undefined);
    assert.equal(JSON.stringify(retained).includes("private"), false);
    assert.deepEqual(Object.keys(scanFormFailureEvent(reason)).sort(), ["category", "eventName", "feature", "formId", "outcome"]);
  }
});
