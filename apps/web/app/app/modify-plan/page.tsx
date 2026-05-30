import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PLAN_DEFINITIONS } from "@website-signal-risk-scanner/shared";
import Link from "next/link";
import { CancelSubscriptionForm } from "../../../components/plans/cancel-subscription-form";
import { ModifyPlanSelectForm } from "../../../components/plans/modify-plan-select-form";
import { SCAN_ACCESS, formatScanThrottleIntervalLabel } from "../../../lib/scan-access";
import { getDashboardContext } from "../../../server/auth";
import {
  openStripeBillingPortalFormAction,
  openStripeSubscriptionCancellationFormAction,
  startStripeCheckoutFormAction
} from "../../../server/billing/actions";
import { loadBillingAccountForOrganization } from "../../../server/billing/repository";
import { getPlanBillingIntent, getStripeBillingMode } from "../../../server/billing/stripe-config";

const planDescriptions: Record<string, string> = {
  individual: "For repeatable page-level checks without a large volume commitment.",
  pro: "For recurring review across multiple pages, site sections, or client sites.",
  team: "For API access, portfolios, agencies, custom retention, features, white-label or higher-volume workflows."
};

type ModifyPlanPageProps = {
  searchParams?: Promise<{
    billing?: string;
  }>;
};

function getBillingNotice(code: string | undefined) {
  switch (code) {
    case "success":
      return "Checkout completed. Your plan will update after Stripe confirms the subscription.";
    case "cancelled":
      return "Cancellation or billing changes were returned from Stripe. Your plan will update after Stripe confirms the subscription status.";
    case "already-cancelled":
      return "That subscription is already cancelled.";
    case "no-active-subscription":
      return "There is no active Stripe subscription to cancel for this account.";
    default:
      return null;
  }
}

function formatBillingDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(value));
}

export default async function ModifyPlanPage({ searchParams }: ModifyPlanPageProps) {
  const { organization } = await getDashboardContext();
  const resolvedSearchParams = await searchParams;
  const billingMode = getStripeBillingMode();
  const billingAccount = await loadBillingAccountForOrganization(organization.id);
  const billingNotice = getBillingNotice(resolvedSearchParams?.billing);
  const hasActiveStripeSubscription = Boolean(
    billingAccount?.stripe_customer_id &&
      billingAccount?.stripe_subscription_id &&
      billingAccount?.stripe_subscription_status !== "canceled"
  );
  const periodEndLabel = formatBillingDate(billingAccount?.plan_current_period_end);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge tone="neutral">Current plan: {organization.plan}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Modify plan</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Select the plan that fits your review workflow. Plans are based on page scans per month, with scan requests paced at one request
          every {formatScanThrottleIntervalLabel()}.
        </p>
      </div>

      {billingNotice ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
          {billingNotice}
        </div>
      ) : null}

      {!billingMode.enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Stripe billing is not configured yet. Missing: {billingMode.missing.join(", ")}.
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-950">Billing and cancellation</h2>
            <p>
              You can manage payment methods, invoices, subscription changes, and cancellation from this page. Paid subscriptions renew
              monthly until cancelled. Cancellation is handled through Stripe&apos;s secure billing portal.
            </p>
            {hasActiveStripeSubscription ? (
              <p className="text-slate-600">
                Current Stripe subscription status: {billingAccount?.stripe_subscription_status ?? "active"}
                {periodEndLabel ? `; current billing period ends ${periodEndLabel}.` : "."}
              </p>
            ) : (
              <p className="text-slate-600">No active Stripe subscription is connected to this account.</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <form action={openStripeBillingPortalFormAction}>
              <input name="intent" type="hidden" value="manage_billing" />
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                type="submit"
              >
                Manage billing
              </button>
            </form>
            {hasActiveStripeSubscription ? (
              <CancelSubscriptionForm action={openStripeSubscriptionCancellationFormAction} />
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        {PLAN_DEFINITIONS.map((plan) => {
          const isCurrent = plan.code === organization.plan;
          const billingIntent = getPlanBillingIntent(plan.code, organization.plan);
          const formAction = billingIntent === "checkout" ? startStripeCheckoutFormAction : openStripeBillingPortalFormAction;

          return (
            <Card
              key={plan.code}
              className={[
                "border-slate-200 bg-white shadow-none",
                isCurrent ? "border-slate-900 ring-1 ring-slate-900/10" : ""
              ].join(" ")}
            >
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-start justify-between gap-3">
                  <span>{plan.label}</span>
                  <span className="text-right text-sm font-medium text-slate-700">{plan.priceLabel}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0 text-sm text-slate-700">
                <p>{planDescriptions[plan.code] ?? plan.description}</p>
                <p className="font-medium text-slate-900">{plan.monthlyPageScanLabel}*</p>
                {plan.apiAccess ? (
                  <div className="space-y-2">
                    <p className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold leading-5 text-violet-950">
                      API access included for custom workflows.
                    </p>
                    <p className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold leading-5 text-violet-950">
                      Higher throttling rates available.
                    </p>
                  </div>
                ) : null}
                <p>Scan history: {plan.code === "pro" || plan.scanHistoryEnabled ? "Included" : "Not included"}</p>
                <div className="pt-2">
                  {billingIntent === "contact_sales" ? (
                    <Link
                      className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
                      href="/contact-sales?source=modify-plan&plan=custom"
                    >
                      Contact sales
                    </Link>
                  ) : (
                    <ModifyPlanSelectForm
                      action={formAction}
                      billingIntent={billingIntent}
                      isCurrent={isCurrent}
                      plan={plan.code}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="max-w-3xl text-xs leading-5 text-slate-500">
        * Scan requests are limited to one request every {formatScanThrottleIntervalLabel()}. For batch scanning or higher throughput, contact{" "}
        <a className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800" href={`mailto:${SCAN_ACCESS.salesEmail}`}>
          {SCAN_ACCESS.salesEmail}
        </a>
        . Custom plans can support higher throttling rates.
      </p>
      <p className="max-w-3xl text-xs leading-5 text-slate-500">
        Subscription and cancellation terms are summarized in the{" "}
        <Link className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800" href="/terms">
          Terms of Service
        </Link>
        . Privacy-related account and payment processing details are summarized in the{" "}
        <Link className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
