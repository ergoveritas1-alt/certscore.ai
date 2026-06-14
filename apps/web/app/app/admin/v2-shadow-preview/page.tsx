import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import type { ReactNode } from "react";
import { loadV2ShadowPreview } from "../../../../lib/admin/v2-shadow-preview-loader";
import {
  type V2ShadowPreviewModel,
  type V2ShadowPreviewRow,
} from "../../../../lib/admin/v2-shadow-preview";

type V2ShadowPreviewPageProps = {
  searchParams?: Promise<{
    artifact?: string;
  }>;
};

export default async function AdminV2ShadowPreviewPage({ searchParams }: V2ShadowPreviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const artifactPath = resolvedSearchParams.artifact ?? null;
  const result = await loadV2ShadowPreview({ artifactPath });

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>WC01 v2 Shadow Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900">
            Internal shadow diagnostic only. Not customer-facing report output.
          </p>
          <p>
            This preview reads a saved <code className="font-mono">Wc01V2ShadowProjection.json</code> artifact.
            It does not call production report builders, checklist builders, executive summary projection, top-finding
            selection, or normalized-concern mapping.
          </p>
          <form className="flex flex-col gap-3 sm:flex-row" method="get">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
              name="artifact"
              placeholder="artifacts/v2-wc01-shadow-expanded-fresh-registry/cnn.com/Wc01V2ShadowProjection.json"
              type="text"
              defaultValue={artifactPath ?? ""}
            />
            <button
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Load artifact
            </button>
          </form>
        </CardContent>
      </Card>

      {result.status === "disabled" || result.status === "empty" ? (
        <StatusCard title={result.status === "disabled" ? "Preview disabled" : "No artifact selected"} tone="muted">
          {result.message}
        </StatusCard>
      ) : null}

      {result.status === "error" ? (
        <StatusCard title="Fail closed" tone="danger">
          <span className="font-mono">{result.error.code}</span>: {result.error.message}
        </StatusCard>
      ) : null}

      {result.status === "ready" ? <PreviewContent model={result.model} /> : null}
    </div>
  );
}

function PreviewContent({ model }: { model: V2ShadowPreviewModel }) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Source URL" value={model.source.url} />
          <Metric label="Scan ID" value={model.source.scanId} />
          <Metric label="Review ID" value={model.source.reviewId ?? "unknown"} />
          <Metric label="Contract" value={model.contractVersion} />
          <Metric label="Projection" value={model.source.projectionVersion} />
          <Metric label="Production eligible" value={String(model.productionEligible)} />
          <Metric label="Artifact" value={model.artifactPath} wide />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Guardrails</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
          <Metric label="productionEligible true" value={String(model.guardrails.productionEligibleTrue)} />
          <Metric label="topFindingEligible" value={String(model.guardrails.topFindingEligibleCount)} />
          <Metric label="gapEligible" value={String(model.guardrails.gapEligibleCount)} />
          <Metric label="gap token" value={String(model.guardrails.forbiddenGapStatusTokenPresent)} />
          <Metric label="raw blocked fields" value={String(model.guardrails.rawBlockedFieldsPresent)} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <CountCard title="Rows by status" counts={model.rowsByStatus} />
        <CountCard title="Rows by WC01 assessment" counts={model.rowsByWc01AssessmentStatus} />
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Sanitizer warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            {model.sanitizerWarnings.length === 0 ? (
              <p>None.</p>
            ) : (
              model.sanitizerWarnings.map((warning) => (
                <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  {warning}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Rows</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <HeaderCell>Row ID</HeaderCell>
                  <HeaderCell>Source key</HeaderCell>
                  <HeaderCell>Category</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>WC01 status</HeaderCell>
                  <HeaderCell>Top</HeaderCell>
                  <HeaderCell>Gap</HeaderCell>
                  <HeaderCell>Vendors</HeaderCell>
                  <HeaderCell>Limitations</HeaderCell>
                  <HeaderCell>Matched</HeaderCell>
                  <HeaderCell>Missing</HeaderCell>
                  <HeaderCell>Demotions</HeaderCell>
                  <HeaderCell>Evidence</HeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {model.rows.map((row) => (
                  <PreviewRow key={`${row.rowId}:${row.sourceFindingKey}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewRow({ row }: { row: V2ShadowPreviewRow }) {
  return (
    <tr className="align-top">
      <Cell mono>{row.rowId}</Cell>
      <Cell mono>{row.sourceFindingKey}</Cell>
      <Cell>{row.category}</Cell>
      <Cell>{row.status}</Cell>
      <Cell>{row.wc01AssessmentStatus}</Cell>
      <Cell>{String(row.topFindingEligible)}</Cell>
      <Cell>{String(row.gapEligible)}</Cell>
      <Cell>{formatList([...row.vendorPurposes, ...row.vendorLabels])}</Cell>
      <Cell>{formatList(row.coverageLimitationReasons)}</Cell>
      <Cell>{formatList(row.matchedCriteria)}</Cell>
      <Cell>{formatList(row.missingCorroborators)}</Cell>
      <Cell>{formatList(row.demotionReasons)}</Cell>
      <Cell>{row.capped ? "capped" : "not capped"}; omitted {row.omittedCount}</Cell>
    </tr>
  );
}

function StatusCard({ children, title, tone }: { children: ReactNode; title: string; tone: "danger" | "muted" }) {
  const className = tone === "danger"
    ? "border-red-200 bg-red-50 text-red-900"
    : "border-slate-200 bg-white text-slate-700";
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

function CountCard({ counts, title }: { counts: Record<string, number>; title: string }) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-700">
        {entries.length === 0 ? (
          <p>None.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span>{key}</span>
              <span className="font-mono text-slate-950">{value}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2 xl:col-span-4" : undefined}>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-slate-950">{value}</p>
    </div>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="py-2 pr-4 font-medium">{children}</th>;
}

function Cell({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <td className={`max-w-64 py-3 pr-4 text-slate-700 ${mono ? "font-mono" : ""}`}>
      {children}
    </td>
  );
}

function formatList(values: string[]) {
  return values.length > 0 ? values.slice(0, 6).join(", ") : "none";
}
