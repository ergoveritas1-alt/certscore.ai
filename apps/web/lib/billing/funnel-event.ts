import type { PlanCode } from "@website-signal-risk-scanner/shared";
import type { ProductAnalyticsPayload } from "../product-analytics/contract";

export type BillingFunnelFeature = "billing_checkout_opened" | "billing_checkout_completed" | "billing_portal_opened" | "billing_cancellation_opened";

export function billingFunnelPayload(feature: BillingFunnelFeature, plan: PlanCode): ProductAnalyticsPayload {
  const portal = feature === "billing_portal_opened" || feature === "billing_cancellation_opened";
  return {
    category: "form",
    elementId: `plan:${plan}`,
    eventName: "form_succeeded",
    feature,
    formId: portal ? "billing_portal" : "billing_checkout",
    outcome: "success",
    route: feature === "billing_checkout_completed" ? "/app/billing/success"
      : portal ? "/app/modify-plan" : "/app/billing/checkout"
  };
}
