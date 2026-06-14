import "server-only";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import type Stripe from "stripe";
import {
  getSelfServePurchasingPausedMessage,
  isSelfServePurchasingEnabled
} from "../access-control";
import type { BootstrapResult } from "../bootstrap-user";
import { getCheckoutCancelPath, getPublicCheckoutPlanCode, normalizeCheckoutPlan, parseSelfServeCheckoutPlan } from "./plan-mapping";
import { getBillingReturnUrl, getStripePriceIdForPlan } from "./stripe-config";
import { getStripeClient } from "./stripe-client";
import { loadBillingAccountForOrganization, setOrganizationStripeCustomer } from "./repository";

export type CheckoutResult = {
  plan: PlanCode;
  sessionId: string;
  url: string;
};

export { getCheckoutCancelPath, parseSelfServeCheckoutPlan };

function getSubscriptionId(value: string | Stripe.Subscription | null) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

export async function createStripeCheckoutForDashboardContext(input: {
  context: BootstrapResult;
  plan: PlanCode;
}): Promise<CheckoutResult> {
  if (!isSelfServePurchasingEnabled()) {
    throw new Error(getSelfServePurchasingPausedMessage());
  }

  const plan = parseSelfServeCheckoutPlan(input.plan);
  const priceId = getStripePriceIdForPlan(plan);
  if (!priceId) {
    throw new Error(`Stripe price is not configured for ${plan}.`);
  }

  const { organization, user } = input.context;
  const stripe = getStripeClient();
  const account = await loadBillingAccountForOrganization(organization.id);
  const existingCustomerId = account?.stripe_customer_id ?? null;
  const existingSubscriptionId = account?.stripe_subscription_id ?? null;

  if (existingCustomerId && existingSubscriptionId && account?.stripe_subscription_status !== "canceled") {
    const subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
    const activeStatuses = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due", "incomplete"]);
    const subscriptionPlan = subscription.items.data[0]?.price.id ? normalizeCheckoutPlan(plan) : null;
    if (activeStatuses.has(subscription.status) && subscriptionPlan) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: existingCustomerId,
        return_url: getBillingReturnUrl("/app/modify-plan")
      });
      return {
        plan,
        sessionId: portalSession.id,
        url: portalSession.url
      };
    }
  }

  const customerId =
    existingCustomerId ??
    (
      await stripe.customers.create({
        email: user.email,
        name: user.fullName ?? organization.name,
        metadata: {
          certscore_account_type: "individual",
          certscore_organization_id: organization.id,
          certscore_user_id: user.id
        }
      })
    ).id;

  if (!existingCustomerId) {
    await setOrganizationStripeCustomer({
      organizationId: organization.id,
      stripeCustomerId: customerId
    });
  }

  const metadata = {
    certscore_account_type: "individual",
    certscore_environment: process.env.NODE_ENV ?? "development",
    certscore_organization_id: organization.id,
    certscore_plan: plan,
    certscore_selected_plan: getPublicCheckoutPlanCode(plan),
    certscore_user_id: user.id
  };
  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    cancel_url: getBillingReturnUrl(getCheckoutCancelPath(plan)),
    client_reference_id: organization.id,
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    metadata,
    mode: "subscription",
    subscription_data: {
      metadata
    },
    success_url: getBillingReturnUrl("/app/billing/success?session_id={CHECKOUT_SESSION_ID}")
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return {
    plan,
    sessionId: getSubscriptionId(session.subscription) ?? session.id,
    url: session.url
  };
}
