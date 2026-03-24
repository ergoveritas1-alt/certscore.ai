import { Badge } from "@website-signal-risk-scanner/ui";
import { notFound } from "next/navigation";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { ScanFindingsPane } from "../../../../../components/scans/scan-findings-pane";
import { ScanViewActions } from "../../../../../components/scans/scan-view-actions";
import { ScanStatusAutoRefresh } from "../../../../../components/scans/scan-status-auto-refresh";
import { getRescanAvailability } from "../../../../../lib/scans/rescan-policy";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingCandidate } from "../../../../../lib/scans/unified-findings";
import { buildValidationFindingLookup } from "../../../../../lib/scans/validation-review-linking";
import { getDashboardContext } from "../../../../../server/auth";
import { getScanById } from "../../../../../server/scans/get-scan-by-id";
import { mapFindingsForJsonView, mapUnifiedPacketsForJsonView } from "./findings";

type ScanJsonPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

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

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

const JSON_POSITIVE_SIGNAL_KEYS = new Set([
  "privacy.privacy_rights_path_present",
  "privacy.gpc_disclosure_present",
  "privacy.targeted_advertising_disclosure_present",
  "commerce.arbitration_clause_present",
  "accessibility.accessibility_contact_method_present"
]);

function getPolicyPageUrlForSignal(input: {
  key: string;
  policyEnrichment: Array<Record<string, unknown>>;
}) {
  if (/commerce\.arbitration_clause_present/i.test(input.key)) {
    return (
      input.policyEnrichment.find((row) => (row.pageType ?? row.page_type) === "terms_of_service")?.pageUrl ??
      input.policyEnrichment.find((row) => (row.pageType ?? row.page_type) === "terms_of_service")?.page_url ??
      null
    );
  }

  return (
    input.policyEnrichment.find((row) => (row.pageType ?? row.page_type) === "privacy_policy")?.pageUrl ??
    input.policyEnrichment.find((row) => (row.pageType ?? row.page_type) === "privacy_policy")?.page_url ??
    null
  );
}

function buildJsonSupplementalSignalCandidates(input: {
  domainHostname: string | null;
  policyEnrichment: Array<Record<string, unknown>>;
  signals: Array<{ key: string; label: string; value: boolean | number | string | string[] }>;
}) {
  const candidates: UnifiedFindingCandidate[] = [];

  for (const signal of input.signals) {
    if (!JSON_POSITIVE_SIGNAL_KEYS.has(signal.key) || signal.value !== true) {
      continue;
    }

    const pageUrl =
      signal.key === "accessibility.accessibility_contact_method_present"
        ? (input.domainHostname ? `https://${input.domainHostname}/` : null)
        : getPolicyPageUrlForSignal({
            key: signal.key,
            policyEnrichment: input.policyEnrichment
          });

    candidates.push({
      description: signal.label,
      fallbackEvidence: {
        pageUrl,
        signalKey: signal.key,
        signalLabel: signal.label,
        signalValue: signal.value
      },
      observedValue: typeof signal.value === "string" ? signal.value : signal.label,
      severity: "low",
      signalKey: signal.key,
      signalLabel: signal.label,
      signalSource: /privacy\.|commerce\./i.test(signal.key) && signal.key !== "accessibility.accessibility_contact_method_present"
        ? "policy_enrichment_signal"
        : "snapshot_signal",
      sourceType: "signal",
      title: signal.label
    });
  }

  return candidates;
}

export default async function ScanJsonPage({ params }: ScanJsonPageProps) {
  const [{ scanId }, { organization, user }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    notFound();
  }

  const canRescan = scanRecord.scan.status === "completed" && Boolean(scanRecord.scan.domainId);
  const rescanAvailability = canRescan
    ? getRescanAvailability({
        activeScanExists: false,
        lastScannedAt: scanRecord.scan.createdAt,
        planCode: organization.plan
      })
    : null;
  const rescanCooldownMessage =
    canRescan && rescanAvailability
      ? rescanAvailability.reason
        ? rescanAvailability.reason
        : !rescanAvailability.allowed
          ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
          : null
      : null;

  const findings = mapFindingsForJsonView({
    domainHostname: scanRecord.scan.domainHostname,
    findings: scanRecord.validationFindings.map((finding) => ({
      evidence: finding.evidence ?? null,
      id: finding.id,
      pageUrl: finding.pageUrl,
      ruleKey: finding.ruleKey,
      severity: finding.severity,
      title: finding.title
    }))
  });
  const supplementalPackets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: buildJsonSupplementalSignalCandidates({
      domainHostname: scanRecord.scan.domainHostname,
      policyEnrichment: scanRecord.policyEnrichment,
      signals: scanRecord.signals
    }),
    validationFindings: scanRecord.validationFindings,
    validationFindingLookup: buildValidationFindingLookup(scanRecord.validationFindings)
  }).filter((packet) => packet.presentationDecision.status === "surface");
  const supplementalFindings = mapUnifiedPacketsForJsonView({
    domainHostname: scanRecord.scan.domainHostname,
    packets: supplementalPackets
  }).filter((finding) => !findings.some((existing) => existing.title === finding.title));
  const allFindings = [...findings, ...supplementalFindings];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Badge tone={scanRecord.scan.status === "completed" ? "success" : "warning"}>
            {formatStatus(scanRecord.scan.status)}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{scanRecord.scan.domainHostname ?? "Unknown website"}</h1>
          <p className="font-mono text-xs text-slate-500">scan_id {scanRecord.scan.id}</p>
          <p className="text-sm text-slate-500">
            Scan created {formatDateTime(scanRecord.scan.createdAt)} · Started {formatDateTime(scanRecord.scan.startedAt)} · Completed{" "}
            {formatDateTime(scanRecord.scan.completedAt)}
          </p>
          <ScanStatusAutoRefresh status={scanRecord.scan.status} />
        </div>
        <ScanViewActions
          alternateHref={`/app/scans/${scanRecord.scan.id}`}
          alternateLabel="report-view"
          canRescan={canRescan && Boolean(scanRecord.scan.domainId) && Boolean(rescanAvailability)}
          cooldownMessage={rescanCooldownMessage}
          domainId={scanRecord.scan.domainId}
          rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
        />
      </div>

      <ScanFindingsPane
        title={`All findings (${allFindings.length})`}
        description="Every finding attached to this scan, including supplemental validation findings, rendered without collapsing duplicates."
        findings={allFindings}
      />
    </div>
  );
}
