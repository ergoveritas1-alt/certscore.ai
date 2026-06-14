import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { requirePlatformAdminContext } from "../../../../server/admin/platform-admin";
import {
  WC01_V2_EVIDENCE_PREVIEW_COHORTS,
  importWc01V2EvidencePreviewCohort,
  type Wc01V2EvidencePreviewCohort,
} from "../../../../server/admin/v2-evidence-preview-import";
import {
  WC01_V2_INTERNAL_REVIEWER_ACTIONS,
  getWc01V2InternalPreviewQueueSummary,
  getWc01V2InternalReviewerDecisionSummary,
  listWc01V2InternalArtifactRuns,
  listWc01V2InternalPreviewItems,
  listWc01V2InternalPreviewQueue,
  listWc01V2InternalPreviewQueueFilterOptions,
  listWc01V2InternalRecentReviewerDecisions,
  listWc01V2InternalReviewerActionCounts,
  listWc01V2InternalReviewerDecisions,
  saveWc01V2InternalReviewerDecision,
  type Wc01V2InternalArtifactRunRow,
  type Wc01V2InternalPreviewItemRow,
  type Wc01V2InternalPreviewQueueDecisionState,
  type Wc01V2InternalPreviewQueueFilterOptions,
  type Wc01V2InternalPreviewQueueRow,
  type Wc01V2InternalPreviewQueueSummary,
  type Wc01V2InternalRecentReviewerDecisionRow,
  type Wc01V2InternalReviewerActionCountRow,
  type Wc01V2InternalReviewerAction,
  type Wc01V2InternalReviewerDecisionSummary,
  type Wc01V2InternalReviewerDecisionRow,
} from "../../../../server/admin/v2-internal-reviewer-persistence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreviewItemJson = {
  vendorLabels?: unknown;
  supportingPurposes?: unknown;
  diagnosticPurposes?: unknown;
  familyEvidenceContext?: unknown;
  caveats?: unknown;
  coverageLimitations?: unknown;
  unresolvedEvidenceRefs?: unknown;
  representativeEvidenceGroups?: unknown;
  resolvedEvidenceExcerpts?: unknown;
  resolvedSourceRefs?: unknown;
};

type EvidenceGroup = {
  groupId: string;
  groupLabel: string;
  evidenceKind: string;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  confidence: string;
  directness: string;
  totalResolvedExcerpts: number;
  totalResolvedSourceRefs: number;
  totalUnresolvedRefs: number;
  totalRedactionWarnings: number;
  representativeExcerpts: EvidenceExcerpt[];
  representativeSourceRefs: SourceRef[];
};

type EvidenceExcerpt = {
  excerptId: string;
  boundedText: string;
  evidenceKind: string;
  displayLabel: string;
  redactionApplied: boolean;
  sourceArtifactPath: string;
};

type SourceRef = {
  sourceRefId: string;
  url: string;
  artifactPath: string;
  redactionApplied: boolean;
};

type V2InternalReviewerPageProps = {
  searchParams?: Promise<{
    importError?: string;
    importedItems?: string;
    importedRuns?: string;
    savedDecision?: string;
    cohort?: string;
    decisionState?: string;
    decisionReviewer?: string;
    family?: string;
    lane?: string;
    reviewerId?: string;
    runId?: string;
    site?: string;
    unresolvedOnly?: string;
  }>;
};

type QueueFilters = {
  cohort: string;
  siteDomain: string;
  family: string;
  queueLane: string;
  decisionState: Wc01V2InternalPreviewQueueDecisionState;
  unresolvedOnly: boolean;
};

type DecisionReviewerFilter = {
  reviewerScope: "all" | "mine" | "reviewer";
  reviewerId: string;
};

type LatestDecisionSummary = {
  reviewer_action: Wc01V2InternalReviewerAction;
  reviewer_id: string;
  decision_notes: string | null;
  markdown_sufficient: boolean | null;
  json_opened: boolean | null;
  upstream_inspection_needed: boolean | null;
  unresolved_refs_blocked_review: boolean | null;
  confidence_directness_clear: boolean | null;
  escalation_needed: boolean | null;
  escalation_reason: string | null;
  created_at: string;
} | null;

export default async function AdminV2InternalReviewerPage({ searchParams }: V2InternalReviewerPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { user } = await requirePlatformAdminContext();
  const queueFilters = parseQueueFilters(resolvedSearchParams);
  const decisionFilter = parseDecisionReviewerFilter(resolvedSearchParams);
  const currentReviewerPath = buildReviewerPath(resolvedSearchParams);
  const selectedDecisionReviewerId = resolveDecisionReviewerId(decisionFilter, user.email);
  const [runsResult, queueResult, queueSummary, filterOptions, decisionSummary, actionCounts, recentDecisions] = await Promise.all([
    listWc01V2InternalArtifactRuns({
      artifactKind: "evidence_preview_packet",
      limit: 50,
    }),
    listWc01V2InternalPreviewQueue({
      cohort: queueFilters.cohort,
      siteDomain: queueFilters.siteDomain,
      family: queueFilters.family,
      queueLane: queueFilters.queueLane,
      decisionState: queueFilters.decisionState,
      unresolvedOnly: queueFilters.unresolvedOnly,
      limit: 100,
    }),
    getWc01V2InternalPreviewQueueSummary(),
    listWc01V2InternalPreviewQueueFilterOptions(),
    getWc01V2InternalReviewerDecisionSummary({ reviewerId: selectedDecisionReviewerId }),
    listWc01V2InternalReviewerActionCounts({ reviewerId: selectedDecisionReviewerId }),
    listWc01V2InternalRecentReviewerDecisions({ reviewerId: selectedDecisionReviewerId, limit: 12 }),
  ]);
  const runs = runsResult.rows;
  const selectedRun = runs.find((run) => run.id === resolvedSearchParams.runId) ?? runs[0] ?? null;
  const items = selectedRun ? (await listWc01V2InternalPreviewItems(selectedRun.id)).rows : [];
  const decisionsByItem = await loadDecisionsByItem(items);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>WC01 v2 Internal Reviewer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900">
            Internal reviewer workflow only. Not customer-facing report output.
          </p>
          <p>
            Persisted v2 preview artifacts and reviewer decisions remain separate from normalized concerns,
            production concern policy, unified findings, report rows, checklist rows, executive summaries,
            scoring, regulatory output, and API/export output.
          </p>
        </CardContent>
      </Card>

      <ImportPanel searchParams={resolvedSearchParams} />

      <DecisionSaveNotice searchParams={resolvedSearchParams} />

      <QueueSummaryCards summary={queueSummary} />

      <DecisionOperationsPanel
        actionCounts={actionCounts.rows}
        currentUserEmail={user.email}
        decisionFilter={decisionFilter}
        filters={queueFilters}
        options={filterOptions}
        recentDecisions={recentDecisions.rows}
        selectedReviewerId={selectedDecisionReviewerId}
        summary={decisionSummary}
      />

      <QueueFiltersForm decisionFilter={decisionFilter} filters={queueFilters} options={filterOptions} />

      <QueueReviewPanel filters={queueFilters} items={queueResult.rows} returnTo={currentReviewerPath} />

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <RunList runs={runs} selectedRunId={selectedRun?.id ?? null} />
        <RunDetail run={selectedRun} items={items} decisionsByItem={decisionsByItem} returnTo={currentReviewerPath} />
      </div>
    </div>
  );
}

function DecisionSaveNotice({
  searchParams,
}: {
  searchParams: Awaited<NonNullable<V2InternalReviewerPageProps["searchParams"]>>;
}) {
  if (searchParams.savedDecision !== "1") {
    return null;
  }

  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
      Reviewer decision saved.
    </p>
  );
}

function QueueSummaryCards({ summary }: { summary: Wc01V2InternalPreviewQueueSummary | null }) {
  const safeSummary = summary ?? {
    total_items: 0,
    undecided_items: 0,
    decided_items: 0,
    escalated_items: 0,
    unresolved_ref_items: 0,
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total items" value={String(safeSummary.total_items)} />
      <Metric label="Undecided" value={String(safeSummary.undecided_items)} />
      <Metric label="Decided" value={String(safeSummary.decided_items)} />
      <Metric label="Escalated" value={String(safeSummary.escalated_items)} />
      <Metric label="Unresolved refs" value={String(safeSummary.unresolved_ref_items)} />
    </div>
  );
}

function DecisionOperationsPanel({
  actionCounts,
  currentUserEmail,
  decisionFilter,
  filters,
  options,
  recentDecisions,
  selectedReviewerId,
  summary,
}: {
  actionCounts: Wc01V2InternalReviewerActionCountRow[];
  currentUserEmail: string;
  decisionFilter: DecisionReviewerFilter;
  filters: QueueFilters;
  options: Wc01V2InternalPreviewQueueFilterOptions | null;
  recentDecisions: Wc01V2InternalRecentReviewerDecisionRow[];
  selectedReviewerId: string | null;
  summary: Wc01V2InternalReviewerDecisionSummary | null;
}) {
  const safeSummary = summary ?? {
    reviewed_items: 0,
    markdown_sufficient_items: 0,
    json_opened_items: 0,
    upstream_inspection_needed_items: 0,
    unresolved_refs_blocked_review_items: 0,
    confidence_directness_clear_items: 0,
    escalation_needed_items: 0,
  };
  const reviewerOptions = options?.reviewer_ids ?? [];

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Reviewer Decision Summary</h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest decision per reviewed item for {selectedReviewerId ?? "all reviewers"}.
          </p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[auto_minmax(12rem,1fr)_auto]" method="get">
          <HiddenQueueFilterInputs filters={filters} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Reviewer</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              name="decisionReviewer"
              defaultValue={decisionFilter.reviewerScope}
            >
              <option value="all">All reviewers</option>
              <option value="mine">Mine ({currentUserEmail})</option>
              <option value="reviewer">Selected reviewer</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Selected reviewer email</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              name="reviewerId"
              defaultValue={decisionFilter.reviewerId}
            >
              <option value="">Choose reviewer</option>
              {reviewerOptions.map((reviewerId) => (
                <option key={reviewerId} value={reviewerId}>
                  {reviewerId}
                </option>
              ))}
            </select>
          </label>
          <button className="self-end rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
            Apply
          </button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Reviewed items" value={String(safeSummary.reviewed_items)} />
        <Metric label="JSON opened" value={String(safeSummary.json_opened_items)} />
        <Metric label="Upstream inspection" value={String(safeSummary.upstream_inspection_needed_items)} />
        <Metric label="Unresolved blockers" value={String(safeSummary.unresolved_refs_blocked_review_items)} />
        <Metric label="Escalations" value={String(safeSummary.escalation_needed_items)} />
        <Metric label="Markdown sufficient" value={String(safeSummary.markdown_sufficient_items)} />
        <Metric label="Confidence clear" value={String(safeSummary.confidence_directness_clear_items)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Actions</h3>
          {actionCounts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No saved reviewer decisions yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {actionCounts.map((row) => (
                <div key={row.reviewer_action} className="flex items-center justify-between gap-3 rounded-md bg-white px-2 py-1.5 text-sm">
                  <span className="text-slate-700">{formatLabel(row.reviewer_action)}</span>
                  <span className="font-mono text-slate-950">{row.decision_count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <RecentDecisionsTable decisions={recentDecisions} />
      </div>
    </section>
  );
}

function RecentDecisionsTable({ decisions }: { decisions: Wc01V2InternalRecentReviewerDecisionRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Recent Decisions</h3>
      </div>
      {decisions.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-600">No saved reviewer decisions match this scope.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Reviewer</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Family</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">SOP flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {decisions.map((decision) => (
                <tr key={decision.id}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{formatAdminDateTime(decision.created_at)}</td>
                  <td className="px-3 py-2 text-slate-700">{decision.reviewer_id}</td>
                  <td className="px-3 py-2 text-slate-700">{decision.site_domain ?? "no site"}</td>
                  <td className="px-3 py-2 text-slate-700">{decision.family}</td>
                  <td className="px-3 py-2 text-slate-900">{formatLabel(decision.reviewer_action)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {summarizeDecisionFlags(decision)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QueueFiltersForm({
  decisionFilter,
  filters,
  options,
}: {
  decisionFilter: DecisionReviewerFilter;
  filters: QueueFilters;
  options: Wc01V2InternalPreviewQueueFilterOptions | null;
}) {
  const safeOptions = options ?? {
    cohorts: [],
    site_domains: [],
    families: [],
    queue_lanes: [],
    reviewer_ids: [],
  };

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Review Queue Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" method="get">
          <HiddenDecisionFilterInputs decisionFilter={decisionFilter} />
          <SelectFilter label="Cohort" name="cohort" value={filters.cohort} values={safeOptions.cohorts} />
          <SelectFilter label="Site" name="site" value={filters.siteDomain} values={safeOptions.site_domains} />
          <SelectFilter label="Family" name="family" value={filters.family} values={safeOptions.families} />
          <SelectFilter label="Queue lane" name="lane" value={filters.queueLane} values={safeOptions.queue_lanes} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Decision state</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              name="decisionState"
              defaultValue={filters.decisionState}
            >
              <option value="undecided">Undecided</option>
              <option value="all">All</option>
              <option value="decided">Decided</option>
              <option value="needs_more_evidence">Needs more evidence</option>
              <option value="sensitive_context_escalated">Sensitive context escalated</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className="flex min-h-10 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                className="h-4 w-4 rounded border-slate-300"
                defaultChecked={filters.unresolvedOnly}
                name="unresolvedOnly"
                type="checkbox"
                value="1"
              />
              Unresolved only
            </label>
            <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
              Apply
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SelectFilter({
  label,
  name,
  value,
  values,
}: {
  label: string;
  name: string;
  value: string;
  values: string[];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900" name={name} defaultValue={value}>
        <option value="">All</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueReviewPanel({
  filters,
  items,
  returnTo,
}: {
  filters: QueueFilters;
  items: Wc01V2InternalPreviewQueueRow[];
  returnTo: string;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Items Needing Review</h2>
        <div className="flex flex-col gap-2 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>
            Showing {items.length} queue items for {formatDecisionState(filters.decisionState)}.
          </p>
          <p>Default view is undecided items. Decisions stay internal and artifact-backed.</p>
        </div>
      </div>
      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            No queue items match the current filters.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <PreviewItemCard
                key={item.id}
                item={item}
                latestDecision={latestDecisionFromQueueRow(item)}
                returnTo={returnTo}
                runContext={`${item.run_cohort ?? "no cohort"} · ${formatAdminDateTime(item.run_created_at)}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ImportPanel({
  searchParams,
}: {
  searchParams: Awaited<NonNullable<V2InternalReviewerPageProps["searchParams"]>>;
}) {
  const importedRuns = parseCount(searchParams.importedRuns);
  const importedItems = parseCount(searchParams.importedItems);
  const importError = searchParams.importError ?? null;

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Import Evidence Preview Cohort</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={importEvidencePreviewCohortAction} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Local cohort</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900" name="cohort" defaultValue="policy-stress">
              {WC01_V2_EVIDENCE_PREVIEW_COHORTS.map((cohort) => (
                <option key={cohort.value} value={cohort.value}>
                  {cohort.label} · {cohort.path}
                </option>
              ))}
            </select>
          </label>
          <button className="self-end rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
            Import
          </button>
        </form>
        {importedRuns !== null && importedItems !== null ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Imported {importedRuns} runs and {importedItems} queue items.
          </p>
        ) : null}
        {importError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Import failed closed: {importError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunList({ runs, selectedRunId }: { runs: Wc01V2InternalArtifactRunRow[]; selectedRunId: string | null }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Artifact Runs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.length === 0 ? (
          <p className="text-sm text-slate-600">No persisted v2 preview runs yet.</p>
        ) : (
          runs.map((run) => {
            const selected = run.id === selectedRunId;
            return (
              <Link
                key={run.id}
                className={`block rounded-lg border px-3 py-2 text-sm transition ${
                  selected ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
                href={`/app/admin/v2-internal-reviewer?decisionState=all&runId=${encodeURIComponent(run.id)}`}
              >
                <span className="block font-medium">{run.site_domain ?? run.source_label}</span>
                <span className={selected ? "text-slate-200" : "text-slate-500"}>
                  {run.cohort ?? "no cohort"} · {run.queue_item_count} items
                </span>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RunDetail({
  run,
  items,
  decisionsByItem,
  returnTo,
}: {
  run: Wc01V2InternalArtifactRunRow | null;
  items: Wc01V2InternalPreviewItemRow[];
  decisionsByItem: Map<string, Wc01V2InternalReviewerDecisionRow[]>;
  returnTo: string;
}) {
  if (!run) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Selected Run</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">Persist an evidence preview artifact run to begin review.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>{run.site_domain ?? run.source_label}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Cohort" value={run.cohort ?? "none"} />
          <Metric label="Artifact kind" value={run.artifact_kind} />
          <Metric label="Guardrails" value={run.guardrail_status} />
          <Metric label="Created" value={formatAdminDateTime(run.created_at)} />
          <Metric className="md:col-span-2 xl:col-span-4" label="Artifact path" value={run.artifact_path} />
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-6 text-sm text-slate-600">No preview items were persisted for this run.</CardContent>
        </Card>
      ) : (
        items.map((item) => (
          <PreviewItemCard key={item.id} item={item} decisions={decisionsByItem.get(item.id) ?? []} returnTo={returnTo} />
        ))
      )}
    </div>
  );
}

function PreviewItemCard({
  item,
  decisions = [],
  latestDecision: explicitLatestDecision,
  returnTo,
  runContext,
}: {
  item: Wc01V2InternalPreviewItemRow;
  decisions?: Wc01V2InternalReviewerDecisionRow[];
  latestDecision?: LatestDecisionSummary;
  returnTo: string;
  runContext?: string;
}) {
  const latestDecision = explicitLatestDecision ?? decisions[0] ?? null;
  const evidence = summarizePreviewItemJson(item.item_json as PreviewItemJson);
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{item.family}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {item.queue_lane}
              {runContext ? ` · ${runContext}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {item.site_domain ?? "no site"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Queue item" value={item.queue_item_id} />
          <Metric label="Suggested action" value={item.suggested_reviewer_action ?? "none"} />
          <Metric label="Confidence" value={item.confidence_band ?? "unknown"} />
          <Metric label="Directness" value={item.directness ?? "unknown"} />
          <Metric label="Unresolved refs" value={String(item.unresolved_ref_count)} />
          <Metric label="Warnings" value={String(item.warning_count)} />
        </div>

        {item.sensitive_context_categories.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sensitive-context routing: {item.sensitive_context_categories.join(", ")}
          </div>
        ) : null}

        {latestDecision ? (
          <LatestDecisionPanel latestDecision={latestDecision} />
        ) : null}

        <EvidenceSummary evidence={evidence} />

        <form action={saveReviewerDecisionAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <input name="previewItemId" type="hidden" value={item.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Reviewer action</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                name="reviewerAction"
                defaultValue={latestDecision?.reviewer_action ?? item.suggested_reviewer_action ?? "evidence_shape_confirmed"}
              >
                {WC01_V2_INTERNAL_REVIEWER_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {formatLabel(action)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Notes</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                defaultValue={latestDecision?.decision_notes ?? ""}
                name="decisionNotes"
                placeholder="Optional internal note"
                type="text"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <BooleanSelect
              label="Markdown sufficient?"
              name="markdownSufficient"
              value={latestDecision?.markdown_sufficient ?? null}
            />
            <BooleanSelect label="JSON opened?" name="jsonOpened" value={latestDecision?.json_opened ?? null} />
            <BooleanSelect
              label="Upstream inspection needed?"
              name="upstreamInspectionNeeded"
              value={latestDecision?.upstream_inspection_needed ?? null}
            />
            <BooleanSelect
              label="Unresolved refs blocked review?"
              name="unresolvedRefsBlockedReview"
              value={latestDecision?.unresolved_refs_blocked_review ?? null}
            />
            <BooleanSelect
              label="Confidence/directness clear?"
              name="confidenceDirectnessClear"
              value={latestDecision?.confidence_directness_clear ?? null}
            />
            <BooleanSelect label="Escalation needed?" name="escalationNeeded" value={latestDecision?.escalation_needed ?? null} />
          </div>
          <div className="grid gap-3 md:grid-cols-[2fr_auto]">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Escalation reason</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                defaultValue={latestDecision?.escalation_reason ?? ""}
                name="escalationReason"
                placeholder="Required only when escalation is needed"
                type="text"
              />
            </label>
            <button className="self-end rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
              Save decision
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LatestDecisionPanel({ latestDecision }: { latestDecision: NonNullable<LatestDecisionSummary> }) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
      <div>
        <p className="font-medium">
          Latest decision: {formatLabel(latestDecision.reviewer_action)} by {latestDecision.reviewer_id}
        </p>
        <p className="mt-1 text-xs text-emerald-800">{formatAdminDateTime(latestDecision.created_at)}</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <DecisionFact label="Markdown sufficient" value={formatNullableBoolean(latestDecision.markdown_sufficient)} />
        <DecisionFact label="JSON opened" value={formatNullableBoolean(latestDecision.json_opened)} />
        <DecisionFact label="Upstream inspection" value={formatNullableBoolean(latestDecision.upstream_inspection_needed)} />
        <DecisionFact label="Unresolved refs blocked" value={formatNullableBoolean(latestDecision.unresolved_refs_blocked_review)} />
        <DecisionFact label="Confidence/directness clear" value={formatNullableBoolean(latestDecision.confidence_directness_clear)} />
        <DecisionFact label="Escalation needed" value={formatNullableBoolean(latestDecision.escalation_needed)} />
      </div>
      {latestDecision.escalation_reason ? <DecisionFact label="Escalation reason" value={latestDecision.escalation_reason} /> : null}
      {latestDecision.decision_notes ? <DecisionFact label="Notes" value={latestDecision.decision_notes} /> : null}
    </div>
  );
}

function DecisionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5">
      <p className="text-xs font-medium text-emerald-800">{label}</p>
      <p className="mt-0.5 break-words text-sm text-emerald-950">{value}</p>
    </div>
  );
}

function BooleanSelect({ label, name, value }: { label: string; name: string; value: boolean | null }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900" name={name} defaultValue={formatBooleanFormValue(value)}>
        <option value="">Not recorded</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

function EvidenceSummary({ evidence }: { evidence: ReturnType<typeof summarizePreviewItemJson> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <ListPanel title="Vendors" values={evidence.vendorLabels} empty="No vendor labels" />
        <ListPanel title="Supporting purposes" values={evidence.supportingPurposes} empty="No supporting purposes" />
        <ListPanel title="Diagnostic purposes" values={evidence.diagnosticPurposes} empty="No diagnostic purposes" />
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <TextPanel title="Family context" value={evidence.familyEvidenceContext} />
        <ListPanel title="Caveats" values={evidence.caveats} empty="No caveats" />
        <ListPanel title="Coverage limitations" values={evidence.coverageLimitations} empty="No limitations" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Representative Evidence Groups</h3>
          <p className="text-xs text-slate-500">
            Showing {evidence.groups.length} of {evidence.groupCount}; top 5 excerpts and source refs per group.
          </p>
        </div>
        {evidence.groups.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No representative evidence groups were persisted for this item.
          </p>
        ) : (
          <div className="space-y-3">
            {evidence.groups.map((group) => (
              <EvidenceGroupPanel key={group.groupId} group={group} />
            ))}
          </div>
        )}
      </div>

      {evidence.unresolvedEvidenceRefs.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Unresolved evidence refs</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {evidence.unresolvedEvidenceRefs.slice(0, 8).map((ref, index) => (
              <li key={`${ref}-${index}`} className="break-words font-mono text-xs">
                {ref}
              </li>
            ))}
          </ul>
          {evidence.unresolvedEvidenceRefs.length > 8 ? (
            <p className="mt-2 text-xs">+{evidence.unresolvedEvidenceRefs.length - 8} more unresolved refs</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceGroupPanel({ group }: { group: EvidenceGroup }) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-medium text-slate-900">{group.groupLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {group.evidenceKind} · {group.confidence} confidence · {group.directness}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            excerpts {group.totalResolvedExcerpts} · refs {group.totalResolvedSourceRefs} · unresolved {group.totalUnresolvedRefs} · warnings {group.totalRedactionWarnings}
          </p>
        </div>
      </div>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-slate-500">Excerpts</p>
          {group.representativeExcerpts.length === 0 ? (
            <p className="text-sm text-slate-500">No representative excerpts.</p>
          ) : (
            group.representativeExcerpts.slice(0, 5).map((excerpt) => (
              <div key={excerpt.excerptId} className="rounded-md border border-slate-200 bg-white p-2">
                <p className="text-xs text-slate-500">
                  {excerpt.displayLabel || excerpt.evidenceKind} · {excerpt.excerptId}
                </p>
                <p className="mt-1 break-words font-mono text-sm text-slate-900">{excerpt.boundedText}</p>
                {excerpt.redactionApplied ? <p className="mt-1 text-xs text-amber-700">Redaction applied</p> : null}
              </div>
            ))
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-slate-500">Source refs</p>
          {group.representativeSourceRefs.length === 0 ? (
            <p className="text-sm text-slate-500">No representative source refs.</p>
          ) : (
            group.representativeSourceRefs.slice(0, 5).map((sourceRef) => (
              <div key={sourceRef.sourceRefId} className="rounded-md border border-slate-200 bg-white p-2">
                <p className="font-mono text-xs text-slate-500">{sourceRef.sourceRefId}</p>
                <p className="mt-1 break-words text-sm text-slate-900">{sourceRef.url || "No URL label"}</p>
                <p className="mt-1 break-words font-mono text-xs text-slate-500">{sourceRef.artifactPath}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ListPanel({ empty, title, values }: { empty: string; title: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      {values.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.slice(0, 12).map((value) => (
            <span key={value} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
              {value}
            </span>
          ))}
          {values.length > 12 ? (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
              +{values.length - 12}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TextPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{value || "Not provided"}</p>
    </div>
  );
}

function Metric({ className = "", label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 ${className}`}>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-sm text-slate-900">{value}</p>
    </div>
  );
}

function HiddenQueueFilterInputs({ filters }: { filters: QueueFilters }) {
  return (
    <>
      {filters.cohort ? <input name="cohort" type="hidden" value={filters.cohort} /> : null}
      {filters.siteDomain ? <input name="site" type="hidden" value={filters.siteDomain} /> : null}
      {filters.family ? <input name="family" type="hidden" value={filters.family} /> : null}
      {filters.queueLane ? <input name="lane" type="hidden" value={filters.queueLane} /> : null}
      <input name="decisionState" type="hidden" value={filters.decisionState} />
      {filters.unresolvedOnly ? <input name="unresolvedOnly" type="hidden" value="1" /> : null}
    </>
  );
}

function HiddenDecisionFilterInputs({ decisionFilter }: { decisionFilter: DecisionReviewerFilter }) {
  return (
    <>
      <input name="decisionReviewer" type="hidden" value={decisionFilter.reviewerScope} />
      {decisionFilter.reviewerId ? <input name="reviewerId" type="hidden" value={decisionFilter.reviewerId} /> : null}
    </>
  );
}

async function loadDecisionsByItem(items: Wc01V2InternalPreviewItemRow[]) {
  const entries = await Promise.all(
    items.map(async (item) => [item.id, (await listWc01V2InternalReviewerDecisions(item.id)).rows] as const),
  );
  return new Map(entries);
}

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCount(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseQueueFilters(
  searchParams: Awaited<NonNullable<V2InternalReviewerPageProps["searchParams"]>>,
): QueueFilters {
  return {
    cohort: searchParams.cohort?.trim() ?? "",
    siteDomain: searchParams.site?.trim() ?? "",
    family: searchParams.family?.trim() ?? "",
    queueLane: searchParams.lane?.trim() ?? "",
    decisionState: parseDecisionState(searchParams.decisionState),
    unresolvedOnly: searchParams.unresolvedOnly === "1" || searchParams.unresolvedOnly === "true",
  };
}

function buildReviewerPath(searchParams: Awaited<NonNullable<V2InternalReviewerPageProps["searchParams"]>>) {
  const params = new URLSearchParams();
  appendIfPresent(params, "cohort", searchParams.cohort);
  appendIfPresent(params, "site", searchParams.site);
  appendIfPresent(params, "family", searchParams.family);
  appendIfPresent(params, "lane", searchParams.lane);
  appendIfPresent(params, "decisionState", searchParams.decisionState);
  appendIfPresent(params, "unresolvedOnly", searchParams.unresolvedOnly);
  appendIfPresent(params, "decisionReviewer", searchParams.decisionReviewer);
  appendIfPresent(params, "reviewerId", searchParams.reviewerId);
  appendIfPresent(params, "runId", searchParams.runId);
  const queryString = params.toString();
  return queryString ? `/app/admin/v2-internal-reviewer?${queryString}` : "/app/admin/v2-internal-reviewer";
}

function appendIfPresent(params: URLSearchParams, key: string, value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

function withSavedDecisionParam(path: string) {
  const [pathname, queryString = ""] = path.split("?");
  if (pathname !== "/app/admin/v2-internal-reviewer") {
    return "/app/admin/v2-internal-reviewer?savedDecision=1";
  }
  const params = new URLSearchParams(queryString);
  params.set("savedDecision", "1");
  return `${pathname}?${params.toString()}`;
}

function parseDecisionReviewerFilter(
  searchParams: Awaited<NonNullable<V2InternalReviewerPageProps["searchParams"]>>,
): DecisionReviewerFilter {
  const reviewerScope = parseDecisionReviewerScope(searchParams.decisionReviewer);
  return {
    reviewerScope,
    reviewerId: searchParams.reviewerId?.trim() ?? "",
  };
}

function parseDecisionReviewerScope(value: string | undefined): DecisionReviewerFilter["reviewerScope"] {
  switch (value) {
    case "mine":
    case "reviewer":
      return value;
    default:
      return "all";
  }
}

function resolveDecisionReviewerId(filter: DecisionReviewerFilter, currentUserEmail: string) {
  if (filter.reviewerScope === "mine") {
    return currentUserEmail;
  }
  if (filter.reviewerScope === "reviewer") {
    return filter.reviewerId || null;
  }
  return null;
}

function parseDecisionState(value: string | undefined): Wc01V2InternalPreviewQueueDecisionState {
  switch (value) {
    case "all":
    case "undecided":
    case "decided":
    case "needs_more_evidence":
    case "sensitive_context_escalated":
      return value;
    default:
      return "undecided";
  }
}

function formatDecisionState(value: Wc01V2InternalPreviewQueueDecisionState) {
  switch (value) {
    case "all":
      return "all decision states";
    case "undecided":
      return "undecided items";
    case "decided":
      return "decided items";
    case "needs_more_evidence":
      return "items marked needs more evidence";
    case "sensitive_context_escalated":
      return "sensitive-context escalations";
  }
}

function latestDecisionFromQueueRow(item: Wc01V2InternalPreviewQueueRow): LatestDecisionSummary {
  if (!item.latest_reviewer_action) {
    return null;
  }
  return {
    reviewer_action: item.latest_reviewer_action,
    reviewer_id: item.latest_reviewer_id ?? "unknown reviewer",
    decision_notes: item.latest_decision_notes,
    markdown_sufficient: item.latest_markdown_sufficient,
    json_opened: item.latest_json_opened,
    upstream_inspection_needed: item.latest_upstream_inspection_needed,
    unresolved_refs_blocked_review: item.latest_unresolved_refs_blocked_review,
    confidence_directness_clear: item.latest_confidence_directness_clear,
    escalation_needed: item.latest_escalation_needed,
    escalation_reason: item.latest_escalation_reason,
    created_at: item.latest_decision_created_at ?? item.created_at,
  };
}

function formatNullableBoolean(value: boolean | null) {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return "Not recorded";
}

function formatBooleanFormValue(value: boolean | null) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

function summarizeDecisionFlags(decision: Wc01V2InternalRecentReviewerDecisionRow) {
  const flags = [
    decision.json_opened === true ? "JSON opened" : null,
    decision.upstream_inspection_needed === true ? "upstream inspection" : null,
    decision.unresolved_refs_blocked_review === true ? "unresolved blocker" : null,
    decision.escalation_needed === true ? "escalation" : null,
  ].filter((flag): flag is string => Boolean(flag));

  return flags.length > 0 ? flags.join(", ") : "No blocking flags";
}

function parseNullableBoolean(formData: FormData, name: string) {
  const value = formData.get(name);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function summarizePreviewItemJson(item: PreviewItemJson) {
  const groups = asRecordArray(item.representativeEvidenceGroups)
    .slice(0, 12)
    .map((group, index): EvidenceGroup => ({
      groupId: readString(group.groupId) || `group-${index}`,
      groupLabel: readString(group.groupLabel) || readString(group.groupKey) || `Group ${index + 1}`,
      evidenceKind: readString(group.evidenceKind) || "unknown",
      vendorLabels: readStringArray(group.vendorLabels),
      supportingPurposes: readStringArray(group.supportingPurposes),
      diagnosticPurposes: readStringArray(group.diagnosticPurposes),
      confidence: readString(group.confidence) || "unknown",
      directness: readString(group.directness) || "unknown",
      totalResolvedExcerpts: readNumber(group.totalResolvedExcerpts),
      totalResolvedSourceRefs: readNumber(group.totalResolvedSourceRefs),
      totalUnresolvedRefs: readNumber(group.totalUnresolvedRefs),
      totalRedactionWarnings: readNumber(group.totalRedactionWarnings),
      representativeExcerpts: asRecordArray(group.representativeExcerpts).map(readEvidenceExcerpt),
      representativeSourceRefs: asRecordArray(group.representativeSourceRefs).map(readSourceRef),
    }));

  return {
    vendorLabels: readStringArray(item.vendorLabels),
    supportingPurposes: readStringArray(item.supportingPurposes),
    diagnosticPurposes: readStringArray(item.diagnosticPurposes),
    familyEvidenceContext: stringifySafeValue(item.familyEvidenceContext),
    caveats: readStringArray(item.caveats),
    coverageLimitations: readStringArray(item.coverageLimitations).concat(
      asRecordArray(item.coverageLimitations).map((limitation) =>
        readString(limitation.reason) || readString(limitation.description) || JSON.stringify(limitation)
      ),
    ),
    unresolvedEvidenceRefs: readStringArray(item.unresolvedEvidenceRefs).concat(
      asRecordArray(item.unresolvedEvidenceRefs).map((ref) =>
        readString(ref.sourceRefId) || readString(ref.reason) || JSON.stringify(ref)
      ),
    ),
    groupCount: asRecordArray(item.representativeEvidenceGroups).length,
    groups,
  };
}

function readEvidenceExcerpt(value: Record<string, unknown>): EvidenceExcerpt {
  return {
    excerptId: readString(value.excerptId),
    boundedText: readString(value.boundedText),
    evidenceKind: readString(value.evidenceKind),
    displayLabel: readString(value.displayLabel),
    redactionApplied: value.redactionApplied === true,
    sourceArtifactPath: readString(value.sourceArtifactPath),
  };
}

function readSourceRef(value: Record<string, unknown>): SourceRef {
  return {
    sourceRefId: readString(value.sourceRefId),
    url: readString(value.url),
    artifactPath: readString(value.artifactPath),
    redactionApplied: value.redactionApplied === true,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function stringifySafeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

async function saveReviewerDecisionAction(formData: FormData) {
  "use server";

  const { user } = await requirePlatformAdminContext();
  const previewItemId = String(formData.get("previewItemId") ?? "");
  const reviewerAction = String(formData.get("reviewerAction") ?? "") as Wc01V2InternalReviewerAction;
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim();
  const escalationReason = String(formData.get("escalationReason") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "");

  await saveWc01V2InternalReviewerDecision({
    previewItemId,
    reviewerId: user.email,
    reviewerAction,
    decisionNotes: decisionNotes || null,
    markdownSufficient: parseNullableBoolean(formData, "markdownSufficient"),
    jsonOpened: parseNullableBoolean(formData, "jsonOpened"),
    upstreamInspectionNeeded: parseNullableBoolean(formData, "upstreamInspectionNeeded"),
    unresolvedRefsBlockedReview: parseNullableBoolean(formData, "unresolvedRefsBlockedReview"),
    confidenceDirectnessClear: parseNullableBoolean(formData, "confidenceDirectnessClear"),
    escalationNeeded: parseNullableBoolean(formData, "escalationNeeded"),
    escalationReason: escalationReason || null,
    decisionJson: {
      source: "wc01_v2_internal_reviewer_ui",
    },
  });

  revalidatePath("/app/admin/v2-internal-reviewer");
  redirect(withSavedDecisionParam(returnTo));
}

async function importEvidencePreviewCohortAction(formData: FormData) {
  "use server";

  const { user } = await requirePlatformAdminContext();
  const cohort = String(formData.get("cohort") ?? "") as Wc01V2EvidencePreviewCohort;

  let result: Awaited<ReturnType<typeof importWc01V2EvidencePreviewCohort>>;
  try {
    result = await importWc01V2EvidencePreviewCohort({
      cohort,
      createdBy: user.email,
    });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : String(error));
    redirect(`/app/admin/v2-internal-reviewer?importError=${message}`);
  }
  revalidatePath("/app/admin/v2-internal-reviewer");
  redirect(
    `/app/admin/v2-internal-reviewer?importedRuns=${result.persistedRuns}&importedItems=${result.persistedItems}`,
  );
}
