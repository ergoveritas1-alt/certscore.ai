import Link from "next/link";
import { getPlanDefinition, type PlanCode } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AddDomainForm } from "../../components/domains/add-domain-form";
import { RescanDomainForm } from "../../components/scans/rescan-domain-form";
import { getDashboardContext } from "../../server/auth";
import { listOrganizationChanges } from "../../server/changes/list-organization-changes";
import { getOrganizationDomains } from "../../server/domains/get-organization-domains";
import { getRescanAvailability } from "../../lib/scans/rescan-policy";
import { getPlanLimits } from "../../server/plans/get-plan-limits";
import { getOrganizationScans } from "../../server/scans/get-organization-scans";
import { getOrganizationSignalOverview } from "../../server/signals/get-organization-signal-overview";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No activity yet";
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

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

function formatMetric(value: number | null) {
  return value ?? "—";
}

function formatBooleanBadge(value: boolean | null) {
  if (value === null) {
    return "—";
  }

  return value ? "Yes" : "No";
}

function getConsentSummary(scan: Awaited<ReturnType<typeof getOrganizationScans>>[number]) {
  if (scan.consentAuditCompleted) {
    if (scan.consentRejectInteractionSucceeded && scan.consentRejectReducedTracking === false) {
      return "Consent audit: reject did not reduce tracking";
    }

    if (scan.consentRejectInteractionSucceeded && scan.consentRejectReducedThirdPartyCookies === false) {
      return "Consent audit: reject did not reduce third-party cookies";
    }

    if (scan.consentRejectInteractionSucceeded) {
      return "Consent audit: reject interaction succeeded";
    }
  }

  if (scan.cookieBannerPresent === true && scan.cmpVendorName) {
    return `Consent surface visible · ${scan.cmpVendorName}`;
  }

  if (scan.cookieBannerPresent === true) {
    return "Consent surface visible";
  }

  if (scan.cmpVendorName) {
    return `CMP detected · ${scan.cmpVendorName}`;
  }

  return "No consent evidence surfaced";
}

export default async function DashboardPage() {
  const { organization } = await getDashboardContext();
  const [domains, planLimits, recentScans, recentChanges, signalOverview] = await Promise.all([
    getOrganizationDomains(organization.id),
    getPlanLimits(organization.plan),
    getOrganizationScans(organization.id),
    listOrganizationChanges(organization.id, 5),
    getOrganizationSignalOverview(organization.id)
  ]);

  const latestCompletedSignalSet = signalOverview.find((item) => item.latestCompletedAt);
  const shouldShowUpgradePlanCta = organization.plan !== "team" && domains.length >= planLimits.maxDomains;
  const scanCtaHref = shouldShowUpgradePlanCta
    ? "/app/modify-plan"
    : domains[0]
      ? `/app/domains/${domains[0].id}`
      : "/app/domains";
  const scanCtaLabel = shouldShowUpgradePlanCta ? "Upgrade plan" : "Run a scan";
  const recentScansByDomain = recentScans.reduce<
    Array<{
      key: string;
      domainId: string | null;
      hostname: string | null;
      scans: typeof recentScans;
    }>
  >((groups, scan) => {
    const key = scan.domainId ?? scan.domainHostname ?? scan.id;
    const existingGroup = groups.find((group) => group.key === key);

    if (existingGroup) {
      existingGroup.scans.push(scan);
      return groups;
    }

    groups.push({
      key,
      domainId: scan.domainId,
      hostname: scan.domainHostname,
      scans: [scan]
    });

    return groups;
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">
              {domains.length}/{planLimits.maxDomains}
            </p>
            <p>Tracked domains in this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{getPlanDefinition(planLimits.planCode).coverageLabel}</p>
            <p>Current coverage tier for this workspace.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentScans.length}</p>
            <p>Queued, running, or completed scans.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p className="text-2xl font-semibold text-slate-900">{recentChanges.length}</p>
            <p>Signal changes recorded from recent completed scans.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Add a new domain to scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddDomainForm maxDomains={planLimits.maxDomains} planCode={organization.plan} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Recent scan history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentScans.length === 0 ? (
            <p className="text-sm text-slate-600">No scans yet. Add a website to start building scan history.</p>
          ) : (
            <div className="space-y-3">
              {recentScansByDomain.map((group) => {
                const latestScan = group.scans[0];
                if (!latestScan) {
                  return null;
                }

                const availability = getRescanAvailability({
                  activeScanExists: latestScan.domainActiveScanExists,
                  lastScannedAt: latestScan.domainLastScannedAt,
                  planCode: organization.plan
                });
                const cooldownMessage = availability.reason
                  ? availability.reason
                  : !availability.allowed
                    ? formatRescanCooldownMessage(availability.nextAllowedAt, organization.plan)
                    : null;

                return (
                  <div key={group.key} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{group.hostname ?? "Unknown website"}</p>
                        <p className="text-sm text-slate-500">
                          {group.scans.length} {group.scans.length === 1 ? "scan" : "scans"} · newest {formatDateTime(latestScan.createdAt)}
                        </p>
                      </div>
                      {group.domainId ? (
                        <RescanDomainForm
                          cooldownMessage={cooldownMessage}
                          disabled={!availability.allowed}
                          domainId={group.domainId}
                        />
                      ) : null}
                    </div>

                    <div
                      className={
                        group.scans.length > 1
                          ? "max-h-[176px] space-y-2 overflow-y-auto pt-3 pr-1"
                          : "space-y-2 pt-3"
                      }
                    >
                      {group.scans.map((scan) => (
                        <div
                          key={scan.id}
                          className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                            <div className="space-y-1">
                              <p className="text-[13px] font-medium text-slate-900">
                                {scan.scanType} scan · {scan.status} · {formatDateTime(scan.createdAt)}
                              </p>
                              <p className="text-[13px] text-slate-500">
                                Signals {scan.totalSignals ?? 0}
                              </p>
                              <p className="text-[13px] text-slate-600">Overall rating score: {formatMetric(scan.certscoreOverall)}</p>
                              <p className="text-[13px] text-slate-600">{getConsentSummary(scan)}</p>
                            </div>
                            <div className="text-[13px] text-slate-600 sm:min-w-[160px]">
                              <p>Regulatory overlay risk: {formatMetric(scan.regulatoryScore)}</p>
                              <p>Privacy score: {formatMetric(scan.privacyScore)}</p>
                              <p>Consent score: {formatMetric(scan.consentScore)}</p>
                              <p>Accessibility score: {formatMetric(scan.accessibilityScore)}</p>
                              <p>Banner visible: {formatBooleanBadge(scan.cookieBannerPresent)}</p>
                            </div>
                          </div>
                          <div className="self-start sm:self-start">
                            <Button
                              asChild
                              className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                              size="sm"
                              variant="secondary"
                            >
                              <Link aria-label={`View scan for ${scan.scanType} on ${scan.domainHostname ?? "domain"}`} href={`/app/scans/${scan.id}`}>
                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 19V5" />
                                  <path d="m5 12 7-7 7 7" />
                                </svg>
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
