import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  getMonitorSiteRequestCounts,
  listMonitorRequestOrganizationOptions,
  listMonitorSiteRequests
} from "../../../../server/admin/list-monitor-site-requests";
import type {
  AdminMonitorSiteRequestSetupFilter,
  AdminMonitorSiteRequestStatus
} from "../../../../server/admin/repository";
import { activateMonitorSiteSetupFormAction } from "../../../../server/admin/activate-monitor-site-setup";
import { completeMonitorSiteSetupFormAction } from "../../../../server/admin/complete-monitor-site-setup";
import { prepareMonitorSiteSetupFormAction } from "../../../../server/admin/prepare-monitor-site-setup";
import {
  isMonitorSiteActivationEmailConfigured,
  sendMonitorSiteActivationEmailFormAction
} from "../../../../server/admin/send-monitor-site-activation-email";
import { updateMonitorSiteRequestStatusFormAction } from "../../../../server/admin/update-monitor-site-request-status";
import { PendingSubmitButton } from "../../../../components/ui/pending-submit-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["pending", "contacted", "converted", "closed"] as const;
const setupFilters = ["unprepared", "pending_setup", "activated"] as const;
const sourcePlans = ["individual", "pro", "ultra", "enterprise"] as const;

type MonitorRequestsPageProps = {
  searchParams?: Promise<{
    plan?: string;
    q?: string;
    setup?: string;
    status?: string;
  }>;
};

function normalizeStatus(value: string | undefined): AdminMonitorSiteRequestStatus | null {
  return statuses.includes(value as AdminMonitorSiteRequestStatus) ? (value as AdminMonitorSiteRequestStatus) : null;
}

function normalizeSetup(value: string | undefined): AdminMonitorSiteRequestSetupFilter | null {
  return setupFilters.includes(value as AdminMonitorSiteRequestSetupFilter) ? (value as AdminMonitorSiteRequestSetupFilter) : null;
}

function normalizePlan(value: string | undefined) {
  return sourcePlans.includes(value as (typeof sourcePlans)[number]) ? value : null;
}

function normalizeQuery(value: string | undefined) {
  const query = value?.trim().slice(0, 120) ?? "";
  return query.length > 0 ? query : null;
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

function formatFrequency(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function setupLabel(setup: AdminMonitorSiteRequestSetupFilter) {
  if (setup === "pending_setup") {
    return "Pending setup";
  }

  return setup
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function planLabel(plan: string | null) {
  if (!plan) {
    return "Any plan";
  }

  if (plan === "pro") {
    return "Pro";
  }

  return plan[0]?.toUpperCase() + plan.slice(1);
}

function filterHref(input: {
  plan?: string | null;
  query?: string | null;
  setup?: AdminMonitorSiteRequestSetupFilter | null;
  status?: AdminMonitorSiteRequestStatus | null;
}) {
  const params = new URLSearchParams();
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.setup) {
    params.set("setup", input.setup);
  }
  if (input.plan) {
    params.set("plan", input.plan);
  }
  if (input.query) {
    params.set("q", input.query);
  }
  const query = params.toString();
  return query ? `/app/admin/monitor-requests?${query}` : "/app/admin/monitor-requests";
}

export default async function MonitorRequestsPage({ searchParams }: MonitorRequestsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const activeSetup = normalizeSetup(resolvedSearchParams.setup);
  const activePlan = normalizePlan(resolvedSearchParams.plan);
  const activeQuery = normalizeQuery(resolvedSearchParams.q);
  const [requests, counts, organizations, monitorActivationEmailConfigured] = await Promise.all([
    listMonitorSiteRequests({
      plan: activePlan,
      query: activeQuery,
      setup: activeSetup,
      status: activeStatus
    }),
    getMonitorSiteRequestCounts(),
    listMonitorRequestOrganizationOptions(),
    isMonitorSiteActivationEmailConfigured()
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
            <p className="text-sm text-slate-500">
              Showing {requests.length} of {counts.total} total requests
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <Button asChild size="sm" variant={activeStatus === null ? "primary" : "secondary"}>
              <Link href={filterHref({ plan: activePlan, query: activeQuery, setup: activeSetup })}>All ({counts.total})</Link>
            </Button>
            {statuses.map((status) => (
              <Button key={status} asChild size="sm" variant={activeStatus === status ? "primary" : "secondary"}>
                <Link href={filterHref({ plan: activePlan, query: activeQuery, setup: activeSetup, status })}>
                  {statusLabel(status)} ({counts[status]})
                </Link>
              </Button>
            ))}
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <form action="/app/admin/monitor-requests" className="grid gap-3 sm:grid-cols-[1fr_auto]">
              {activeStatus ? <input name="status" type="hidden" value={activeStatus} /> : null}
              {activeSetup ? <input name="setup" type="hidden" value={activeSetup} /> : null}
              {activePlan ? <input name="plan" type="hidden" value={activePlan} /> : null}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600" htmlFor="monitor-request-search">
                  Search site, requester, or company
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  defaultValue={activeQuery ?? ""}
                  id="monitor-request-search"
                  name="q"
                  placeholder="example.com or name@company.com"
                  type="search"
                />
              </div>
              <Button size="sm" type="submit" variant="secondary">
                Search
              </Button>
            </form>

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Setup</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant={activeSetup === null ? "primary" : "secondary"}>
                  <Link href={filterHref({ plan: activePlan, query: activeQuery, status: activeStatus })}>Any setup</Link>
                </Button>
                {setupFilters.map((setup) => (
                  <Button key={setup} asChild size="sm" variant={activeSetup === setup ? "primary" : "secondary"}>
                    <Link href={filterHref({ plan: activePlan, query: activeQuery, setup, status: activeStatus })}>
                      {setupLabel(setup)}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Source plan</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant={activePlan === null ? "primary" : "secondary"}>
                  <Link href={filterHref({ query: activeQuery, setup: activeSetup, status: activeStatus })}>Any plan</Link>
                </Button>
                {sourcePlans.map((plan) => (
                  <Button key={plan} asChild size="sm" variant={activePlan === plan ? "primary" : "secondary"}>
                    <Link href={filterHref({ plan, query: activeQuery, setup: activeSetup, status: activeStatus })}>
                      {planLabel(plan)}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            {activeStatus || activeSetup || activePlan || activeQuery ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/app/admin/monitor-requests">Clear filters</Link>
              </Button>
            ) : null}
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          {request.sourceContext ? <Badge tone="neutral">Source: {request.sourceContext}</Badge> : null}
                          {request.sourcePlan ? <Badge tone="neutral">Plan: {planLabel(request.sourcePlan)}</Badge> : null}
                        </div>
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
                          <div className="min-w-72 space-y-3 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={request.monitorSetup.setupStatus === "activated" ? "success" : "neutral"}>
                                {request.monitorSetup.setupStatus === "activated" ? "Activated" : "Pending setup"}
                              </Badge>
                              <span className="font-medium text-slate-800">{request.monitorSetup.hostname}</span>
                            </div>
                            <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <dt className="text-slate-500">Workspace</dt>
                              <dd className="font-mono text-[11px] text-slate-700" title={request.monitorSetup.organizationId}>
                                {shortId(request.monitorSetup.organizationId)}
                              </dd>
                              <dt className="text-slate-500">Domain</dt>
                              <dd className="font-mono text-[11px] text-slate-700" title={request.monitorSetup.domainId}>
                                {shortId(request.monitorSetup.domainId)}
                              </dd>
                              <dt className="text-slate-500">Requested</dt>
                              <dd className="font-medium text-slate-800">{formatFrequency(request.monitorSetup.requestedFrequency)}</dd>
                              {request.monitorSetup.previousFrequency ? (
                                <>
                                  <dt className="text-slate-500">Previous</dt>
                                  <dd className="font-medium text-slate-800">{formatFrequency(request.monitorSetup.previousFrequency)}</dd>
                                </>
                              ) : null}
                              <dt className="text-slate-500">Current active</dt>
                              <dd className="font-medium text-slate-800">
                                {request.monitorSetup.setupStatus === "activated"
                                  ? formatFrequency(request.monitorSetup.activeFrequency ?? request.monitorSetup.requestedFrequency)
                                  : "Manual"}
                              </dd>
                            </dl>
                            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                              <p className="font-medium text-slate-800">Setup audit</p>
                              <ol className="space-y-2">
                                <li>
                                  <p className="font-medium text-slate-700">Prepared</p>
                                  <p>By {shortId(request.monitorSetup.linkedByUserId)}</p>
                                  <p>{formatDateTime(request.monitorSetup.linkedAt)}</p>
                                </li>
                                {request.monitorSetup.setupStatus === "activated" ? (
                                  <li>
                                    <p className="font-medium text-slate-700">Activated</p>
                                    <p>By {shortId(request.monitorSetup.activatedByUserId)}</p>
                                    <p>{formatDateTime(request.monitorSetup.activatedAt)}</p>
                                    {request.monitorSetup.activationConfirmedAt ? (
                                      <p>
                                        Setup confirmed by {shortId(request.monitorSetup.activationConfirmedByUserId)} at{" "}
                                        {formatDateTime(request.monitorSetup.activationConfirmedAt)}
                                      </p>
                                    ) : null}
                                    {request.monitorSetup.activationNote ? (
                                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-600">
                                        {request.monitorSetup.activationNote}
                                      </p>
                                    ) : null}
                                  </li>
                                ) : null}
                                {request.monitorSetup.confirmationEmailSentAt ? (
                                  <li>
                                    <p className="font-medium text-slate-700">Confirmation email sent</p>
                                    <p>By {shortId(request.monitorSetup.confirmationEmailSentByUserId)}</p>
                                    <p>{formatDateTime(request.monitorSetup.confirmationEmailSentAt)}</p>
                                  </li>
                                ) : null}
                              </ol>
                            </div>
                            {request.monitorSetup.setupStatus === "activated" ? (
                              <div className="space-y-2">
                                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                                  This setup has been explicitly activated for the requested cadence.
                                </p>
                                {request.monitorSetup.confirmationEmailSentAt ? (
                                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
                                    Customer confirmation email has been recorded.
                                  </p>
                                ) : (
                                  <form action={sendMonitorSiteActivationEmailFormAction} className="pt-1">
                                    <input name="requestId" type="hidden" value={request.id} />
                                    <PendingSubmitButton
                                      disabled={!monitorActivationEmailConfigured}
                                      idleContent="Send confirmation email"
                                      pendingContent="Sending..."
                                      size="sm"
                                      variant="secondary"
                                    />
                                    {!monitorActivationEmailConfigured ? (
                                      <p className="mt-2 text-xs leading-5 text-slate-500">
                                        Gmail sender config is not available for monitor confirmations.
                                      </p>
                                    ) : null}
                                  </form>
                                )}
                              </div>
                            ) : (
                              <>
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                                  Current schedule remains manual until explicit activation.
                                </p>
                                <form action={completeMonitorSiteSetupFormAction} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                                  <input name="requestId" type="hidden" value={request.id} />
                                  <p className="mb-2 text-xs font-medium text-blue-950">Guided completion</p>
                                  <p className="mb-3 text-xs leading-5 text-blue-900">
                                    Confirms the requested cadence, activates monitoring for this workspace domain, sends the customer
                                    confirmation email, and records both audit events.
                                  </p>
                                  <label className="mb-2 flex items-start gap-2 text-xs leading-5 text-blue-950">
                                    <input
                                      className="mt-1 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                      name="setupConfirmation"
                                      required
                                      type="checkbox"
                                      value="confirmed"
                                    />
                                    <span>
                                      I confirm setup has been reviewed with the requester. Completing setup will move this domain from
                                      manual scheduling to the requested cadence and notify the requester.
                                    </span>
                                  </label>
                                  <label className="mb-2 block text-xs font-medium text-blue-950" htmlFor={`setup-note-${request.id}`}>
                                    Setup note
                                  </label>
                                  <textarea
                                    className="mb-3 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    id={`setup-note-${request.id}`}
                                    maxLength={500}
                                    name="setupNote"
                                    placeholder="Optional internal note, for example requester approval or setup context."
                                  />
                                  <PendingSubmitButton
                                    disabled={!monitorActivationEmailConfigured}
                                    idleContent="Confirm setup and notify customer"
                                    pendingContent="Completing..."
                                    size="sm"
                                    variant="primary"
                                  />
                                  {!monitorActivationEmailConfigured ? (
                                    <p className="mt-2 text-xs leading-5 text-blue-900">
                                      Gmail sender config is not available, so guided completion is disabled.
                                    </p>
                                  ) : null}
                                </form>
                                {!monitorActivationEmailConfigured ? (
                                  <form action={activateMonitorSiteSetupFormAction} className="pt-1">
                                    <input name="requestId" type="hidden" value={request.id} />
                                    <input name="activationConfirmation" type="hidden" value="confirmed" />
                                    <label
                                      className="mb-2 block text-xs font-medium text-slate-600"
                                      htmlFor={`activation-note-${request.id}`}
                                    >
                                      Activation note
                                    </label>
                                    <textarea
                                      className="mb-3 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                      id={`activation-note-${request.id}`}
                                      maxLength={500}
                                      name="activationNote"
                                      placeholder="Optional internal note for activation without customer email."
                                    />
                                    <PendingSubmitButton
                                      idleContent="Activate without email"
                                      pendingContent="Activating..."
                                      size="sm"
                                      variant="secondary"
                                    />
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                      Use only when customer notification is handled outside CertScore.
                                    </p>
                                  </form>
                                ) : null}
                              </>
                            )}
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
