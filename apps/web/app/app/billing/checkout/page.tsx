import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getSelfServePurchasingPausedMessage,
  isSelfServePurchasingEnabled
} from "../../../../server/access-control";
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
  if (!isSelfServePurchasingEnabled()) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h1 className="text-lg font-semibold text-amber-950">Checkout paused</h1>
        <p>{getSelfServePurchasingPausedMessage()}</p>
        <Link className="font-medium underline underline-offset-4" href="/contact-sales?source=checkout-paused">
          Contact sales
        </Link>
      </div>
    );
  }

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
