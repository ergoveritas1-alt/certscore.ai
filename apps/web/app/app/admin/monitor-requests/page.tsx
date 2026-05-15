import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  getMonitorSiteRequestCounts,
  listMonitorRequestOrganizationOptions,
  listMonitorSiteRequests
} from "../../../../server/admin/list-monitor-site-requests";
import type { AdminMonitorSiteRequestStatus } from "../../../../server/admin/repository";
import { prepareMonitorSiteSetupFormAction } from "../../../../server/admin/prepare-monitor-site-setup";
import { updateMonitorSiteRequestStatusFormAction } from "../../../../server/admin/update-monitor-site-request-status";
import { PendingSubmitButton } from "../../../../components/ui/pending-submit-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["pending", "contacted", "converted", "closed"] as const;

type MonitorRequestsPageProps = {
  searchParams?: Promise<{
    status?: string;
  }>;
};

function normalizeStatus(value: string | undefined): AdminMonitorSiteRequestStatus | null {
  return statuses.includes(value as AdminMonitorSiteRequestStatus) ? (value as AdminMonitorSiteRequestStatus) : null;
}

function statusLabel(status: AdminMonitorSiteRequestStatus) {
  return status
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function statusTone(status: AdminMonitorSiteRequestStatus) {
  if (status === "pending") {
    return "warning";
  }

  if (status === "converted") {
    return "success";
  }

  return "neutral";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
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

function filterHref(status: AdminMonitorSiteRequestStatus | null) {
  return status ? `/app/admin/monitor-requests?status=${status}` : "/app/admin/monitor-requests";
}

export default async function MonitorRequestsPage({ searchParams }: MonitorRequestsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const [requests, counts, organizations] = await Promise.all([
    listMonitorSiteRequests(activeStatus),
    getMonitorSiteRequestCounts(),
    listMonitorRequestOrganizationOptions()
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Monitor Requests</CardTitle>
              <p className="max-w-3xl text-sm text-slate-500">
                Pending intake records from the public monitor form. Status changes here do not activate monitoring, schedule scans, or
                create account-linked monitors.
              </p>
            </div>
            <p className="text-sm text-slate-500">{counts.total} total requests</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <Button asChild size="sm" variant={activeStatus === null ? "primary" : "secondary"}>
              <Link href={filterHref(null)}>All ({counts.total})</Link>
            </Button>
            {statuses.map((status) => (
              <Button key={status} asChild size="sm" variant={activeStatus === status ? "primary" : "secondary"}>
                <Link href={filterHref(status)}>
                  {statusLabel(status)} ({counts[status]})
                </Link>
              </Button>
            ))}
          </div>

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              No monitor requests match this view.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Site</th>
                    <th className="pb-3 pr-4 font-medium">Requester</th>
                    <th className="pb-3 pr-4 font-medium">Context</th>
                    <th className="pb-3 pr-4 font-medium">Setup</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 [&_td]:align-top">
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td className="py-4 pr-4">
                        <p className="font-medium text-slate-900">{request.website}</p>
                        <p className="text-xs text-slate-500">{request.normalizedHostname}</p>
                        <p className="mt-2 text-xs text-slate-500">Created {formatDateTime(request.createdAt)}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-medium text-slate-900">{request.workEmail}</p>
                        <p className="text-xs text-slate-500">{request.fullName ?? "No name provided"}</p>
                        <p className="text-xs text-slate-500">{request.company ?? "No company provided"}</p>
                      </td>
                      <td className="max-w-md py-4 pr-4 text-slate-600">
                        <p className="font-medium text-slate-800">{request.monitoringGoal}</p>
                        {request.notes ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5">{request.notes}</p> : null}
                        <div className="mt-2 space-y-1 text-xs">
                          {request.sourceReportUrl ? (
                            <p>
                              Report:{" "}
                              <a className="text-blue-700 hover:text-blue-900" href={request.sourceReportUrl}>
                                {request.sourceReportUrl}
                              </a>
                            </p>
                          ) : null}
                          {request.sourcePageUrl ? (
                            <p>
                              Source:{" "}
                              <a className="text-blue-700 hover:text-blue-900" href={request.sourcePageUrl}>
                                {request.sourcePageUrl}
                              </a>
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-sm py-4 pr-4">
                        {request.monitorSetup ? (
                          <div className="space-y-2 text-xs text-slate-600">
                            <Badge tone="neutral">Pending setup</Badge>
                            <p>Linked domain: {request.monitorSetup.hostname}</p>
                            <p>Workspace ID: {request.monitorSetup.organizationId}</p>
                            <p>Domain ID: {request.monitorSetup.domainId}</p>
                            <p>Requested cadence: {request.monitorSetup.requestedFrequency}</p>
                            <p>Current schedule remains manual until explicit activation.</p>
                          </div>
                        ) : (
                          <form action={prepareMonitorSiteSetupFormAction} className="min-w-64 space-y-3">
                            <input name="requestId" type="hidden" value={request.id} />
                            <div className="space-y-1">
                              <label className="block text-xs font-medium text-slate-600" htmlFor={`organization-${request.id}`}>
                                Workspace
                              </label>
                              <select
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                disabled={organizations.length === 0}
                                id={`organization-${request.id}`}
                                name="organizationId"
                                required
                              >
                                <option value="">Choose workspace</option>
                                {organizations.map((organization) => (
                                  <option key={organization.id} value={organization.id}>
                                    {organization.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-xs font-medium text-slate-600" htmlFor={`frequency-${request.id}`}>
                                Requested cadence
                              </label>
                              <select
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                defaultValue="weekly"
                                id={`frequency-${request.id}`}
                                name="requestedFrequency"
                              >
                                <option value="manual">Manual</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            </div>
                            <PendingSubmitButton
                              disabled={organizations.length === 0}
                              idleContent="Prepare setup"
                              pendingContent="Preparing..."
                              size="sm"
                              variant="secondary"
                            />
                            <p className="text-xs leading-5 text-slate-500">
                              Creates or links the workspace domain with manual scheduling. Requested cadence is stored for follow-up only.
                            </p>
                          </form>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <Badge tone={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                        <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(request.updatedAt)}</p>
                      </td>
                      <td className="py-4">
                        <form action={updateMonitorSiteRequestStatusFormAction} className="flex min-w-48 flex-col gap-2">
                          <input type="hidden" name="id" value={request.id} />
                          <label className="sr-only" htmlFor={`status-${request.id}`}>
                            Monitor request status
                          </label>
                          <select
                            id={`status-${request.id}`}
                            name="status"
                            defaultValue={request.status}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            {statuses.map((status) => (
                              <option key={status} value={status}>
                                {statusLabel(status)}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" type="submit" variant="secondary">
                            Save status
                          </Button>
                        </form>
                        <p className="mt-2 max-w-48 text-xs leading-5 text-slate-500">
                          Converted marks admin follow-through only. Runtime monitoring still requires separate setup.
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
