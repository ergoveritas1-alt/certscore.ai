import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PLAN_DEFINITIONS } from "@website-signal-risk-scanner/shared";
import { ModifyPlanSelectForm } from "../../../components/plans/modify-plan-select-form";
import { SCAN_ACCESS } from "../../../lib/scan-access";
import { getDashboardContext } from "../../../server/auth";
import { updateCurrentOrganizationPlanFormAction } from "../../../server/plans/update-current-organization-plan";

export default async function ModifyPlanPage() {
  const { organization } = await getDashboardContext();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge tone="neutral">Current plan: {organization.plan}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Modify plan</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Select the plan that fits your review workflow. Plans are based on page scans per month, with scan requests paced at one request
          every {SCAN_ACCESS.scanThrottleMinutes} minutes.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLAN_DEFINITIONS.map((plan) => {
          const isCurrent = plan.code === organization.plan;

          return (
            <Card
              key={plan.code}
              className={[
                "border-slate-200 bg-white shadow-none",
                isCurrent ? "border-slate-900 ring-1 ring-slate-900/10" : ""
              ].join(" ")}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.label}</span>
                  <span className="text-base font-medium text-slate-700">{plan.priceLabel}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p>{plan.description}</p>
                <p className="font-medium text-slate-900">{plan.monthlyPageScanLabel}</p>
                <p>Coverage: {plan.coverageLabel}</p>
                <p>Scan cadence: {plan.scanFrequency === "manual" ? "Manual" : "Plan-specific scheduled monitoring"}</p>
                <p>Scan history: {plan.code === "pro" || plan.scanHistoryEnabled ? "Included" : "Not included"}</p>
                <p className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  Scan requests are limited to one request every {SCAN_ACCESS.scanThrottleMinutes} minutes. For batch scanning or higher
                  throughput, contact {SCAN_ACCESS.salesEmail}.
                </p>
                <div className="pt-2">
                  <ModifyPlanSelectForm
                    action={updateCurrentOrganizationPlanFormAction}
                    isCurrent={isCurrent}
                    plan={plan.code}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
