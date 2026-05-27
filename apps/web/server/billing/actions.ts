"use server";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDashboardContext } from "../auth";
import { getBillingReturnUrl, getStripeBillingEnv, getStripeBillingMode, getStripePriceIdForPlan } from "./stripe-config";
import { getStripeClient } from "./stripe-client";
import { loadBillingAccountForOrganization, setOrganizationStripeCustomer } from "./repository";

const checkoutSchema = z.object({
  plan: z.enum(["individual", "pro"])
});

const portalSchema = z.object({
  intent: z.literal("manage_billing").optional()
});

function requireStripeBillingEnabled() {
  const mode = getStripeBillingMode();
  if (!mode.enabled) {
    throw new Error(`Stripe billing is not configured. Missing: ${mode.missing.join(", ")}.`);
  }
}

export async function startStripeCheckoutFormAction(formData: FormData): Promise<void> {
  requireStripeBillingEnabled();

  const { organization, user } = await getDashboardContext();
  const parsed = checkoutSchema.parse({
    plan: formData.get("plan") as PlanCode
  });
  const priceId = getStripePriceIdForPlan(parsed.plan);

  if (!priceId) {
    throw new Error(`Stripe price is not configured for ${parsed.plan}.`);
  }

  const stripe = getStripeClient();
  const account = await loadBillingAccountForOrganization(organization.id);
  const existingCustomerId = account?.stripe_customer_id ?? null;
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

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    cancel_url: getBillingReturnUrl("/app/modify-plan?billing=cancelled"),
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    metadata: {
      certscore_account_type: "individual",
      certscore_organization_id: organization.id,
      certscore_plan: parsed.plan,
      certscore_user_id: user.id
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        certscore_account_type: "individual",
        certscore_organization_id: organization.id,
        certscore_plan: parsed.plan,
        certscore_user_id: user.id
      }
    },
    success_url: getBillingReturnUrl("/app/modify-plan?billing=success")
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
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
    customer: customerId,
    return_url: getBillingReturnUrl(returnPath)
  });

  redirect(session.url);
}
