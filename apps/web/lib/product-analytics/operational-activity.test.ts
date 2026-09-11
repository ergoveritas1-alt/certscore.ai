import assert from "node:assert/strict";
import test from "node:test";
import { extractScanIdFromPath, parseProductAnalyticsPayload } from "./contract";
import { isAuthenticatedActivity, operationalActivityPayload } from "./operational-activity";

const scanId = "bbbfc77a-a9b2-48a2-8afe-e5f0b1f2eb1c";
const payload = parseProductAnalyticsPayload({
  route: `/app/scans/${scanId}?private=value`, scanId, eventName: "scan_viewed",
  category: "scan", outcome: "observed", feature: "route",
  eventId: "ceadffd9-640c-41ad-a183-65795eed5903",
  actorId: scanId, sessionId: scanId, campaignSource: "email", entryRoute: "/pricing",
})!;

test("operational scan views retain resource and retry identity but not marketing identity", () => {
  assert.ok(isAuthenticatedActivity(payload));
  const retained = operationalActivityPayload(payload);
  assert.equal(retained.scanId, scanId);
  assert.equal(retained.route, "/app/scans/:id");
  assert.equal(retained.eventId, payload.eventId);
  for (const key of ["actorId", "sessionId", "campaignSource", "entryRoute"] as const) assert.equal(retained[key], undefined);
});

test("marketing routes and consent choices are not promoted to operational activity", () => {
  for (const route of ["/", "/pricing", "/application", "/app-other"]) {
    assert.equal(isAuthenticatedActivity({ ...payload, route }), false);
  }
  for (const eventName of ["analytics_opted_in", "analytics_opted_out"] as const) {
    assert.equal(isAuthenticatedActivity({ ...payload, eventName }), false);
  }
});

test("all supported authenticated interaction types retain attribution eligibility", () => {
  for (const eventName of ["page_viewed", "scan_viewed", "report_viewed", "action_clicked", "navigation_clicked", "form_started", "form_submitted", "form_succeeded", "form_failed", "client_error"] as const) {
    assert.ok(isAuthenticatedActivity({ ...payload, eventName }));
  }
  assert.equal(extractScanIdFromPath(`/app/scanso/${scanId}`), scanId);
});

test("opted-out logged-in scan access is operational; anonymous access cannot acquire an actor", async () => {
  const { resolveActivityAttribution } = await import("./operational-activity");
  const userId = "ceadffd9-640c-41ad-a183-65795eed5903";
  const attributed = resolveActivityAttribution(payload, userId, "opted_out");
  assert.equal(attributed.consentState, "operational");
  assert.equal(attributed.userId, userId);
  assert.equal(attributed.payload.scanId, scanId);
  assert.equal(attributed.payload.actorId, undefined);
  const anonymous = resolveActivityAttribution(payload, null, "opted_out");
  assert.equal(anonymous.consentState, "opted_out");
  assert.equal(anonymous.userId, null);
  const marketing = resolveActivityAttribution({ ...payload, route: "/pricing" }, userId, "opted_out");
  assert.equal(marketing.consentState, "opted_out");
  assert.equal(marketing.userId, null);
});
