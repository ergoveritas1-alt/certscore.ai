"use server";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSelfServePurchasingEnabled } from "../access-control";
import { getDashboardContext } from "../auth";
import { createStripeCheckoutForDashboardContext } from "./checkout";
import { getBillingReturnUrl, getStripeBillingEnv, getStripeBillingMode } from "./stripe-config";
import { getStripeClient } from "./stripe-client";
import { loadBillingAccountForOrganization } from "./repository";

const checkoutSchema = z.object({
  plan: z.enum(["individual", "pro"])
});

const portalSchema = z.object({
  intent: z.literal("manage_billing").optional()
});

const cancellationSchema = z.object({
  intent: z.literal("cancel_subscription")
});

function requireStripeBillingEnabled() {
  const mode = getStripeBillingMode();
  if (!mode.enabled) {
    throw new Error(`Stripe billing is not configured. Missing: ${mode.missing.join(", ")}.`);
  }
}

function getBillingPortalConfigurationId() {
  return getStripeBillingEnv().STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim() || undefined;
}

export async function startStripeCheckoutFormAction(formData: FormData): Promise<void> {
  if (!isSelfServePurchasingEnabled()) {
    redirect("/app/modify-plan?billing=purchases-paused");
  }

  requireStripeBillingEnabled();

  const context = await getDashboardContext();
  const parsed = checkoutSchema.parse({
    plan: formData.get("plan") as PlanCode
  });
  const checkout = await createStripeCheckoutForDashboardContext({ context, plan: parsed.plan });
  redirect(checkout.url);
}

export async function openStripeBillingPortalFormAction(formData: FormData): Promise<void> {
  const { organization } = await getDashboardContext();
  portalSchema.parse({
    intent: formData.get("intent") ?? undefined
  });

  const account = await loadBillingAccountForOrganization(organization.id);
  const customerId = account?.stripe_customer_id;
  if (!customerId) {
    redirect("/app/modify-plan");
  }

  const returnPath = getStripeBillingEnv().STRIPE_BILLING_PORTAL_RETURN_PATH?.trim() || "/app/modify-plan";
  const session = await getStripeClient().billingPortal.sessions.create({
    configuration: getBillingPortalConfigurationId(),
    customer: customerId,
    return_url: getBillingReturnUrl(returnPath)
  });

  redirect(session.url);
}

export async function openStripeSubscriptionCancellationFormAction(formData: FormData): Promise<void> {
  requireStripeBillingEnabled();

  const { organization } = await getDashboardContext();
  cancellationSchema.parse({
    intent: formData.get("intent")
  });

  const account = await loadBillingAccountForOrganization(organization.id);
  const customerId = account?.stripe_customer_id;
  const subscriptionId = account?.stripe_subscription_id;
  if (!customerId || !subscriptionId) {
    redirect("/app/modify-plan?billing=no-active-subscription");
  }

  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  const subscriptionCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (subscriptionCustomerId !== customerId) {
    throw new Error("The active subscription does not match the current billing customer.");
  }

  if (subscription.status === "canceled") {
    redirect("/app/modify-plan?billing=already-cancelled");
  }

  const returnPath = getStripeBillingEnv().STRIPE_BILLING_PORTAL_RETURN_PATH?.trim() || "/app/modify-plan";
  const returnUrl = getBillingReturnUrl(returnPath);
  const session = await getStripeClient().billingPortal.sessions.create({
    configuration: getBillingPortalConfigurationId(),
    customer: customerId,
    flow_data: {
      after_completion: {
        redirect: {
          return_url: getBillingReturnUrl("/app/modify-plan?billing=cancelled")
        },
        type: "redirect"
      },
      subscription_cancel: {
        subscription: subscriptionId
      },
      type: "subscription_cancel"
    },
    return_url: returnUrl
  });

  redirect(session.url);
}
