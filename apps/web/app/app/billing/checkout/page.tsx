import { redirect } from "next/navigation";
import { getDashboardContext } from "../../../../server/auth";
import { createStripeCheckoutForDashboardContext, parseSelfServeCheckoutPlan } from "../../../../server/billing/checkout";
import { getStripeBillingMode } from "../../../../server/billing/stripe-config";

export const dynamic = "force-dynamic";

type BillingCheckoutPageProps = {
  searchParams?: Promise<{
    plan?: string;
  }>;
};

export default async function BillingCheckoutPage({ searchParams }: BillingCheckoutPageProps) {
  const resolvedSearchParams = await searchParams;
  const billingMode = getStripeBillingMode();
  if (!billingMode.enabled) {
    throw new Error(`Stripe billing is not configured. Missing: ${billingMode.missing.join(", ")}.`);
  }

  const plan = parseSelfServeCheckoutPlan(resolvedSearchParams?.plan);
  const context = await getDashboardContext();
  const checkout = await createStripeCheckoutForDashboardContext({ context, plan });
  redirect(checkout.url);
}
