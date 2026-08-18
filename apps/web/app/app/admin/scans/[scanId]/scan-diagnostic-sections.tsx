import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { VendorBrandChip } from "../../../../../components/scans/vendor-brand-chip";
import { formatAdminDateTime } from "../../../../../lib/admin/date-time";
import {
  getAdminScanInventoryDiagnostics,
  getAdminScanReviewDiagnostics,
  getAdminScanRuntimeDiagnostics
} from "../../../../../server/admin/get-admin-scan-detail";
import { listAdminPulseRequestsForScan } from "../../../../../server/admin/list-pulse-requests";

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function formatReason(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRequestedGeo(scanConfigJson: Record<string, unknown> | null) {
  const requestedGeo =
    scanConfigJson && typeof scanConfigJson.requestedGeo === "object" && scanConfigJson.requestedGeo !== null
      ? (scanConfigJson.requestedGeo as Record<string, unknown>)
      : null;

  return {
    country: typeof requestedGeo?.country === "string" ? requestedGeo.country : null,
    provider: typeof requestedGeo?.provider === "string" ? requestedGeo.provider : null,
    region: typeof requestedGeo?.region === "string" ? requestedGeo.region : null
  };
}

function getLatestRuntimeContextMetadata(events: Array<{ metadataJson: Record<string, unknown> | null }>) {
  return events.find((event) => event.metadataJson)?.metadataJson ?? null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readStringField(record: Record<string, unknown> | null, field: string) {
  const value = record?.[field];
  return typeof value === "string" ? value : null;
}

function readBooleanField(record: Record<string, unknown> | null, field: string) {
  const value = record?.[field];
  return typeof value === "boolean" ? value : null;
}

function formatLocalV2DagLambdaStatus(metadataJson: Record<string, unknown> | null) {
  return readStringField(metadataJson, "resultStatus") ?? readStringField(metadataJson, "targetEnvironment") ?? "recorded";
}

function formatLocalV2DagLambdaError(metadataJson: Record<string, unknown> | null) {
  const error = readRecord(metadataJson?.error);
  const message = readStringField(error, "message");
  const code = readStringField(error, "code");

  if (message && code) {
    return `${code}: ${message}`;
  }

  return message ?? code ?? null;
}

function formatLocalV2DagLambdaArtifacts(metadataJson: Record<string, unknown> | null) {
  const artifactPointers = readRecord(metadataJson?.artifactPointers);

  if (!artifactPointers || Object.keys(artifactPointers).length === 0) {
    return null;
  }

  return JSON.stringify(artifactPointers);
}

function DiagnosticFallback({ title }: { title: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-5 w-48 animate-pulse rounded bg-slate-100" aria-label={`Loading ${title}`} />
      </CardContent>
    </Card>
  );
}

async function PulseRequestsSection({ scanId }: { scanId: string }) {
  const pulseRequests = await listAdminPulseRequestsForScan(scanId);

  if (pulseRequests.length === 0) {
    return null;
  }

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Linked Pulse Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pulseRequests.map((request) => (
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700" key={request.publicId}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium text-slate-900">{request.publicId}</p>
                <p className="text-xs text-slate-500">
                  {request.status} · {request.detail ?? "standard"} · {request.format ?? "json"} ·{" "}
                  {request.resolutionMode ?? "unknown"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a className="font-semibold text-sky-700" href={`/app/admin/pulse/${request.publicId}`}>
                  Pulse detail
                </a>
                {request.resultPulseUrl ? (
                  <a className="font-semibold text-sky-700" href={request.resultPulseUrl}>
                    Pulse API
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function RuntimeDiagnosticsSection({
  scanConfigJson,
  scanFromLabel,
  scanId
}: {
  scanConfigJson: Record<string, unknown> | null;
  scanFromLabel: string;
  scanId: string;
}) {
  const record = await getAdminScanRuntimeDiagnostics(scanId);
  const requestedGeo = getRequestedGeo(scanConfigJson);
  const latestRuntimeContext = getLatestRuntimeContextMetadata(record.runtimeContextEvents);

  return (
    <>
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Scan From Context</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
          <p>Requested location: {scanFromLabel}</p>
          <p>Requested provider: {formatValue(requestedGeo.provider)}</p>
          <p>Requested country: {formatValue(requestedGeo.country)}</p>
          <p>Requested region: {formatValue(requestedGeo.region)}</p>
          <p>Scanner egress ID: {formatValue(latestRuntimeContext?.egressId)}</p>
          <p>Scanner egress provider: {formatValue(latestRuntimeContext?.egressProvider)}</p>
          <p>Proxy configured: {formatValue(latestRuntimeContext?.proxyConfigured)}</p>
          <p>Runtime event: {formatAdminDateTime(record.runtimeContextEvents[0]?.createdAt ?? null)}</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Local v2 DAG Lambda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {record.localV2DagLambdaEvents.length === 0 ? (
            <p className="text-sm text-slate-600">No local v2 DAG Lambda events for this scan.</p>
          ) : (
            record.localV2DagLambdaEvents.map((event, index) => {
              const artifactOnly = readBooleanField(event.metadataJson, "artifactOnly");
              const productionFindingIntegration = readBooleanField(event.metadataJson, "productionFindingIntegration");
              const scannerBuildProvenance = readRecord(event.metadataJson?.scannerBuildProvenance);
              const wc01Projection = readRecord(event.metadataJson?.wc01Projection);
              const error = formatLocalV2DagLambdaError(event.metadataJson);
              const artifactPointers = formatLocalV2DagLambdaArtifacts(event.metadataJson);

              return (
                <div
                  key={`${event.eventType}-${event.createdAt ?? index}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{event.eventType}</p>
                      <p>{event.message ?? "No message recorded."}</p>
                    </div>
                    <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      {formatLocalV2DagLambdaStatus(event.metadataJson)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <p>Created: {formatAdminDateTime(event.createdAt)}</p>
                    <p>Target env: {formatValue(readStringField(event.metadataJson, "targetEnvironment"))}</p>
                    <p>Scanner execution: {formatValue(readStringField(event.metadataJson, "scannerExecutionMode"))}</p>
                    <p>Artifact boundary: {formatValue(artifactOnly)}</p>
                    <p>Scanner-direct finding integration: {formatValue(productionFindingIntegration)}</p>
                    <p>WC01 projection mode: {formatValue(readStringField(wc01Projection, "mode"))}</p>
                    <p>WC01 projection version: {formatValue(readStringField(wc01Projection, "version"))}</p>
                    <p>Scanner Git SHA: {formatValue(readStringField(scannerBuildProvenance, "gitSha"))}</p>
                    <p>Build provenance: {formatValue(readStringField(event.metadataJson, "scannerBuildProvenanceStatus"))}</p>
                  </div>
                  {error ? <p className="mt-3 text-sm text-amber-700">Result detail: {error}</p> : null}
                  {artifactPointers ? <p className="mt-3 break-all font-mono text-xs text-slate-500">{artifactPointers}</p> : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {record.runtimeArtifacts ? (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Runtime Artifacts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
            <p>Third-party request count: {formatValue(record.runtimeArtifacts.third_party_request_count)}</p>
            <p>Third-party request domains: {formatValue(record.runtimeArtifacts.third_party_request_domains)}</p>
            <p>Initial cookie count: {formatValue(record.runtimeArtifacts.initial_cookie_count)}</p>
            <p>Initial cookie names: {formatValue(record.runtimeArtifacts.initial_cookie_names)}</p>
            <p>Initial cookie domains: {formatValue(record.runtimeArtifacts.initial_cookie_domains)}</p>
            <p>Script tag count: {formatValue(record.runtimeArtifacts.script_tag_count)}</p>
            <p>Script source domains: {formatValue(record.runtimeArtifacts.script_src_domains)}</p>
            <p>DOM node count: {formatValue(record.runtimeArtifacts.dom_node_count)}</p>
            <p>DOM structure hash: {formatValue(record.runtimeArtifacts.dom_structure_hash)}</p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

async function ReviewDiagnosticsSection({ scanId }: { scanId: string }) {
  const record = await getAdminScanReviewDiagnostics(scanId);

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Policy Review Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {record.policyReviewQueue.length === 0 ? (
          <p className="text-sm text-slate-600">No policy review queue rows for this scan.</p>
        ) : (
          record.policyReviewQueue.map((row, index) => {
            const reason = typeof row.reason === "string" ? row.reason : "unknown";
            const reviewStatus = typeof row.review_status === "string" ? row.review_status : "pending";
            const reviewVerdict =
              typeof row.effective_review_verdict === "string"
                ? row.effective_review_verdict
                : typeof row.review_verdict === "string"
                  ? row.review_verdict
                  : null;
            const reviewerNotes = typeof row.reviewer_notes === "string" ? row.reviewer_notes : null;
            const standardReviewerNote = typeof row.standard_reviewer_note === "string" ? row.standard_reviewer_note : null;
            const noteMatchesStandard = row.reviewer_note_matches_standard === true;
            const guardrailApplied = row.verdict_overridden_by_scope_guardrail === true;
            const pageType = typeof row.page_type === "string" ? row.page_type : "unknown";

            return (
              <div
                key={typeof row.id === "string" ? row.id : `${reason}-${index}`}
                className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{formatReason(reason)}</p>
                    <p>
                      {formatReason(pageType)} · Status {reviewStatus}
                      {reviewVerdict ? ` · Verdict ${reviewVerdict}` : ""}
                    </p>
                  </div>
                  {standardReviewerNote ? (
                    <span
                      className={
                        noteMatchesStandard
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700"
                      }
                    >
                      {noteMatchesStandard ? "standard note" : "custom note"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Saved note</p>
                <p className="mt-1 text-sm text-slate-700">{reviewerNotes ?? "Not provided"}</p>
                {guardrailApplied ? (
                  <p className="mt-3 text-sm text-amber-700">
                    Scope guardrail applied: substantive policy-gap findings on non-privacy pages default to inconclusive.
                  </p>
                ) : null}
                {standardReviewerNote ? (
                  <>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Standard note</p>
                    <p className="mt-1 text-sm text-slate-700">{standardReviewerNote}</p>
                  </>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

async function InventoryDiagnosticsSection({ scanId }: { scanId: string }) {
  const record = await getAdminScanInventoryDiagnostics(scanId);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Tracker Vendors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.trackerVendors.length === 0 ? (
              <p className="text-sm text-slate-600">No tracker vendor rows for this scan.</p>
            ) : (
              record.trackerVendors.map((tracker) => (
                <div
                  key={`${tracker.vendorName}-${tracker.scriptHost ?? "none"}-${tracker.detectionSource}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
                >
                  <VendorBrandChip category={tracker.vendorCategory} label={tracker.vendorName} suffix={tracker.vendorCategory} />
                  <p>
                    {tracker.vendorCategory} · {tracker.detectionSource} · {tracker.firstPartyOrThirdParty}
                  </p>
                  <p>
                    Before consent {tracker.beforeConsent ? "true" : "false"} · Confidence {tracker.confidence}
                  </p>
                  <p>
                    Host {tracker.scriptHost ?? "n/a"} · Signature {tracker.matchedSignatureId ?? "n/a"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Accessibility Rule Counts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.accessibilityRuleCounts.length === 0 ? (
              <p className="text-sm text-slate-600">No accessibility rule rows for this scan.</p>
            ) : (
              record.accessibilityRuleCounts.map((rule) => (
                <div key={rule.ruleCode} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{rule.ruleCode}</p>
                  <p>
                    Group {rule.ruleGroup} · Severity {rule.severity}
                  </p>
                  <p>Instances {rule.instanceCount}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Page Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.pages.length === 0 ? (
              <p className="text-sm text-slate-600">No page rows for this scan.</p>
            ) : (
              record.pages.map((page) => (
                <div key={page.pageUrl} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="break-all font-medium text-slate-900">{page.pageUrl}</p>
                  <p>
                    {page.pageType} · {page.fetchStatus} · {page.fetchedVia}
                  </p>
                  <p>Language {page.pageLanguage ?? "n/a"}</p>
                  <p>Content hash {page.normalizedContentHash ?? "n/a"}</p>
                  <p>Title hash {page.titleHash ?? "n/a"}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Change Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.changes.length === 0 ? (
              <p className="text-sm text-slate-600">No change events for this scan.</p>
            ) : (
              record.changes.map((change, index) => (
                <div
                  key={`${change.eventType}-${index}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
                >
                  <p className="font-medium text-slate-900">{change.eventType}</p>
                  <p>
                    {change.eventGroup} · {change.severity} · {formatAdminDateTime(change.eventTimestamp)}
                  </p>
                  <p>Field {change.fieldName ?? "n/a"}</p>
                  <p>Old {change.oldValueText ?? "null"}</p>
                  <p>New {change.newValueText ?? "null"}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function AdminScanDeferredSections({
  scanConfigJson,
  scanFromLabel,
  scanId
}: {
  scanConfigJson: Record<string, unknown> | null;
  scanFromLabel: string;
  scanId: string;
}) {
  return (
    <>
      <Suspense fallback={<DiagnosticFallback title="Linked Pulse Requests" />}>
        <PulseRequestsSection scanId={scanId} />
      </Suspense>
      <Suspense fallback={<DiagnosticFallback title="Execution Context" />}>
        <RuntimeDiagnosticsSection scanConfigJson={scanConfigJson} scanFromLabel={scanFromLabel} scanId={scanId} />
      </Suspense>
      <Suspense fallback={<DiagnosticFallback title="Policy Review Queue" />}>
        <ReviewDiagnosticsSection scanId={scanId} />
      </Suspense>
      <Suspense fallback={<DiagnosticFallback title="Evidence Inventory" />}>
        <InventoryDiagnosticsSection scanId={scanId} />
      </Suspense>
    </>
  );
}
