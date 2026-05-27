import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../server/bootstrap-user";
import { getBillingReturnUrl, getStripeBillingEnv } from "../../../../server/billing/stripe-config";
import { getStripeClient } from "../../../../server/billing/stripe-client";
import { loadBillingAccountForOrganization } from "../../../../server/billing/repository";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { organization } = await bootstrapAppUserSession(user);
  const account = await loadBillingAccountForOrganization(organization.id);
  const customerId = account?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer is connected to this account." }, { status: 409 });
  }

  const returnPath = getStripeBillingEnv().STRIPE_BILLING_PORTAL_RETURN_PATH?.trim() || "/app/modify-plan";
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: getBillingReturnUrl(returnPath)
  });

  return NextResponse.json({ url: session.url });
}
