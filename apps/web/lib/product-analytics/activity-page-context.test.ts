import assert from "node:assert/strict";
import test from "node:test";
import { retainedActivityPagePath, activityPageLink } from "./activity-page-context";
import { parseProductAnalyticsPayload } from "./contract";
import { activityActionLabel, activitySourceLabel } from "../admin/user-activity-presentation";
const id = "bbbfc77a-a9b2-48a2-8afe-e5f0b1f2eb1c";
test("exact activity links retain only approved paths and cannot invent lost resources", () => {
  assert.equal(retainedActivityPagePath(`/app/scans/${id}?token=secret#tab`), `/app/scans/${id}`);
  for (const value of ["https://evil.test/app", "//evil.test/app", "/app/%2f%2fevil.test", "/app/users/alice@example.com", "/app/private-text", "/api/delete", "/app/scans/not-an-id", "/app/../api"]) assert.equal(retainedActivityPagePath(value), null);
  assert.equal(activityPageLink({normalized_route: "/app/scans/:id", scan_id: id}), `/app/scans/${id}`);
  assert.equal(activityPageLink({normalized_route: "/app/domains/:id", scan_id: id}), null);
  assert.equal(activityPageLink({normalized_route: "/app/scans/:id"}), null);
  assert.equal(activityPageLink({normalized_route: "/app"}), "/app");
});
test("capture derives the page path from the route and restricts link destinations", () => {
  const input = {eventName:"navigation_clicked", category:"interaction", feature:"ui_control", outcome:"observed", route:`/app/scans/${id}?secret=value`, pagePath:"/app/admin", targetPath:`/app/domains/${id}?secret=value`};
  const payload = parseProductAnalyticsPayload(input)!;
  assert.equal(payload.route, "/app/scans/:id");
  assert.equal(payload.pagePath, `/app/scans/${id}`);
  assert.equal(payload.targetPath, `/app/domains/${id}`);
  assert.equal(parseProductAnalyticsPayload({...input, targetPath:"https://evil.test/app"})?.targetPath, undefined);
  assert.equal(parseProductAnalyticsPayload({...input, eventName:"action_clicked"})?.targetPath, undefined);
});
test("legacy server observations are requests; only retained confirmation upgrades the label", () => {
  const event = {event_name:"page_viewed", feature:"server_route", browser_family:"server"};
  assert.equal(activityActionLabel(event), "Page requested");
  assert.equal(activitySourceLabel(event), "Server");
  const current = {...event, event_name:"page_requested", feature:"authenticated_page_browser_confirmed", browser_family:"chrome", browser_confirmed_at:"2026-09-15T12:00:00Z"};
  assert.equal(activityActionLabel(current), "Browser-confirmed view");
  assert.equal(activityActionLabel({ ...event, event_name: "action_clicked", feature: "billing_plan_selection" }), "Plan option clicked");
  assert.equal(activityActionLabel({ ...event, event_name: "action_clicked", feature: "billing_management" }), "Billing option clicked");
  assert.equal(activityActionLabel({ ...event, event_name: "form_succeeded", feature: "billing_checkout_completed" }), "Checkout completed");
  assert.equal(activitySourceLabel(current), "Server + browser");
  assert.equal(activitySourceLabel({...event, feature:"route", browser_family:"chrome"}), "Browser");
});
