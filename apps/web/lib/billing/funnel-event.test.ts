import assert from "node:assert/strict";
import test from "node:test";
import { billingFunnelPayload } from "./funnel-event";
import { parseProductAnalyticsPayload } from "../product-analytics/contract";

test("billing funnel events distinguish created checkout sessions from completed Stripe sessions", () => {
  const opened = billingFunnelPayload("billing_checkout_opened", "individual");
  const completed = billingFunnelPayload("billing_checkout_completed", "individual");
  assert.equal(opened.feature, "billing_checkout_opened");
  assert.equal(opened.route, "/app/billing/checkout");
  assert.equal(completed.feature, "billing_checkout_completed");
  assert.equal(completed.route, "/app/billing/success");
  assert.equal(completed.elementId, "plan:individual");
  assert.equal(parseProductAnalyticsPayload(opened)?.feature, opened.feature);
  assert.equal(parseProductAnalyticsPayload(completed)?.feature, completed.feature);
});

test("billing portal outcomes remain distinct from checkout", () => {
  const portal = billingFunnelPayload("billing_portal_opened", "team");
  const cancellation = billingFunnelPayload("billing_cancellation_opened", "team");
  assert.equal(portal.formId, "billing_portal");
  assert.equal(cancellation.formId, "billing_portal");
  assert.equal(portal.route, "/app/modify-plan");
  assert.equal(cancellation.route, "/app/modify-plan");
});
