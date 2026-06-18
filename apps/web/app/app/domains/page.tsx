import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AddDomainForm } from "../../../components/domains/add-domain-form";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationDomains } from "../../../server/domains/get-organization-domains";
import { withServerTiming } from "../../../server/performance/log-server-timing";
import { getOrganizationSettings } from "../../../server/settings/get-organization-settings";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No scans yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatStatus(status: string | null) {
  if (!status) {
    return "Not started";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatScheduled(value: string | null, dueNow: boolean) {
  if (dueNow) {
    return "Due now";
  }

  if (!value) {
    return "Manual";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

export default async function DomainsPage() {
  const { organization } = await withServerTiming("app.domains.context", () => getDashboardContext());
  const [domains, organizationSettings] = await withServerTiming("app.domains.primary_data", () =>
    Promise.all([
      getOrganizationDomains(organization.id),
      getOrganizationSettings(organization.id)
    ])
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <Card className="border border-slate-200 bg-white lg:w-[360px]">
          <CardHeader>
            <CardTitle>Add a website</CardTitle>
          </CardHeader>
          <CardContent>
            <AddDomainForm defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"} planCode={organization.plan} />
          </CardContent>
        </Card>
      </div>

      {domains.length === 0 ? (
        <Card className="border border-dashed border-slate-300 bg-white">
          <CardContent className="space-y-3 p-10 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Add your first website</h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-600">
              Websites are the unit of scan history, signal tracking, and scheduled rescans.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <PendingButtonLink href="/how-it-works" idleContent="How scanning works" pendingContent="Opening..." size="sm" variant="secondary" />
              <PendingButtonLink href="/pricing" idleContent="Compare plans" pendingContent="Opening..." size="sm" variant="secondary" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Tracked websites</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Website</th>
                  <th className="pb-3 pr-4 font-medium">Industry</th>
                  <th className="pb-3 pr-4 font-medium">Monitoring</th>
                  <th className="pb-3 pr-4 font-medium">Latest scan</th>
                  <th className="pb-3 pr-4 font-medium">Last activity</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td className="py-4 pr-4">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{domain.hostname}</p>
                        <p className="text-slate-500">{domain.normalizedUrl}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{domain.industryPrimaryLabel ?? "Unassigned"}</td>
                    <td className="py-4 pr-4 text-slate-600">
                      <div className="space-y-1">
                        <p>{domain.scanFrequency}</p>
                        <p className="text-slate-500">
                          Next: {formatScheduled(domain.nextScheduledAt, domain.isDueForScheduledScan)}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{formatStatus(domain.latestScanStatus)}</td>
                    <td className="py-4 pr-4 text-slate-600">{formatDateTime(domain.latestScanCreatedAt)}</td>
                    <td className="py-4">
                      <PendingButtonLink href={`/app/domains/${domain.id}`} idleContent="View website" pendingContent="Opening..." size="sm" variant="secondary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
