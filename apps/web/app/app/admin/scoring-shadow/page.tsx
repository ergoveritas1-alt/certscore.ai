import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { summarizeCanonicalShadowScoreCohort } from "../../../../lib/scans/canonical-shadow-score-cohort";
import { summarizeStoredCanonicalShadowComparisons } from "../../../../lib/scans/canonical-shadow-score-monitor";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL } from "../../../../lib/scans/canonical-shadow-score-model";
import { buildStoredScanCanonicalShadowScore } from "../../../../server/scans/canonical-shadow-score-service";
import { loadCanonicalShadowScoreMonitoringMetrics } from "../../../../server/scans/canonical-shadow-score-monitor-repository";

type ScoringShadowPageProps = {
  searchParams?: Promise<{
    scanId?: string | string[];
  }>;
};

const MAX_SCANS_PER_REVIEW = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeScanIds(value: string | string[] | undefined) {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const normalized = [...new Set(values.map((scanId) => scanId.trim()))];
  return normalized.length === values.length && normalized.length <= MAX_SCANS_PER_REVIEW && normalized.every((scanId) => UUID_PATTERN.test(scanId))
    ? normalized
    : null;
}

export default async function AdminScoringShadowPage({ searchParams }: ScoringShadowPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const scanIds = normalizeScanIds(resolvedSearchParams.scanId);

  if (scanIds === null) {
    return <StatusCard message={`Provide no more than ${MAX_SCANS_PER_REVIEW} unique UUID scanId parameters.`} title="Invalid review request" />;
  }

  const monitoring = await loadCanonicalShadowScoreMonitoringMetrics({
    modelVersion: GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.version,
    windowHours: 168
  }).then((metrics) => ({
    available: true as const,
    summary: summarizeStoredCanonicalShadowComparisons(metrics)
  })).catch((error) => ({
    available: false as const,
    reason: error instanceof Error ? error.message : String(error)
  }));

  if (scanIds.length === 0) {
    return (
      <div className="space-y-6">
        <MonitoringCard monitoring={monitoring} />
        <StatusCard message="Add one or more scanId query parameters to run a read-only shadow comparison." title="No scans selected" />
      </div>
    );
  }

  const generatedAt = new Date().toISOString();
  const artifacts = [];
  const failures: Array<{ reason: string; scanId: string }> = [];
  for (const scanId of scanIds) {
    try {
      const artifact = await buildStoredScanCanonicalShadowScore(scanId, generatedAt);
      if (artifact) artifacts.push(artifact);
      else failures.push({ reason: "scan_not_found", scanId });
    } catch {
      failures.push({ reason: "projection_or_scoring_failed", scanId });
    }
  }

  const payload = {
    artifacts,
    failures,
    generatedAt,
    inputScanCount: scanIds.length,
    schemaVersion: "canonical-shadow-score-admin-cohort.v1",
    summary: summarizeCanonicalShadowScoreCohort(artifacts)
  };

  return (
    <div className="space-y-6">
      <MonitoringCard monitoring={monitoring} />
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>GDPR/ePrivacy scoring shadow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900">
            Internal, read-only comparison. It does not rescan a site, persist a score, or change customer-facing reports.
          </p>
          <p>
            Candidate posture scores remain ineligible for cutover while the model is pending Luna approval.
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Bounded comparison artifact</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function MonitoringCard({
  monitoring
}: {
  monitoring:
    | { available: true; summary: ReturnType<typeof summarizeStoredCanonicalShadowComparisons> }
    | { available: false; reason: string };
}) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Seven-day scoring monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p>
          Passive candidate metrics only: score drift, contradictions, withholding, and comparable cross-region repeats.
          Customer reports remain on the legacy score until Luna approves the exact model and the controlled flag is enabled.
        </p>
        {monitoring.available ? (
          <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(monitoring.summary, null, 2)}
          </pre>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            Monitoring data is not available yet. {monitoring.reason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCard({ message, title }: { message: string; title: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-600">{message}</CardContent>
    </Card>
  );
}
