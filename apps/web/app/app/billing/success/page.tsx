import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { getDashboardContext } from "../../../../server/auth";
import { loadBillingAccountForOrganization } from "../../../../server/billing/repository";
import { getStripeClient } from "../../../../server/billing/stripe-client";

export const dynamic = "force-dynamic";

type BillingSuccessPageProps = {
  searchParams?: Promise<{
    session_id?: string;
  }>;
};

function getCheckoutSessionId(value: string | undefined) {
  if (!value || !value.startsWith("cs_")) {
    return null;
  }

  return value;
}

function isActiveBillingStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageProps) {
  const { organization, user } = await getDashboardContext();
  const resolvedSearchParams = await searchParams;
  const sessionId = getCheckoutSessionId(resolvedSearchParams?.session_id);
  const billingAccount = await loadBillingAccountForOrganization(organization.id);
  const isActive = isActiveBillingStatus(billingAccount?.stripe_subscription_status);
  let sessionVerified = false;

  if (sessionId) {
    const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
    sessionVerified =
      session.client_reference_id === organization.id ||
      session.metadata?.certscore_organization_id === organization.id ||
      session.metadata?.certscore_user_id === user.id;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "Subscription active" : "Payment received"}</Badge>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          {isActive ? "Your paid plan is ready" : "Setting up your paid plan"}
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          {isActive
            ? "Stripe has confirmed your subscription and CertScore.ai has activated your paid plan."
            : "Stripe redirected you back successfully. Paid access is activated only after the signed Stripe webhook updates your account, which can take a moment."}
        </p>
        {sessionId && !sessionVerified ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            This checkout session could not be matched to your signed-in workspace. Your plan was not changed from this page.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
          href="/app"
        >
          Go to dashboard
        </Link>
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
          href="/app/modify-plan"
        >
          View billing
        </Link>
      </div>
    </div>
  );
}
