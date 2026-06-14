"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  V2ScanLabCandidateSignal,
  V2ScanLabEvidenceGroup,
  V2ScanLabVendorPurposeSummary,
} from "../../../../server/admin/v2-scan-lab-artifacts";

type ExplorerProps = {
  evidenceGroups: V2ScanLabEvidenceGroup[];
  signals: V2ScanLabCandidateSignal[];
  vendorPurposeSummary: V2ScanLabVendorPurposeSummary[];
};

type ReviewDisposition = "needs_review" | "artifact_ready" | "hold";
type AttentionFilter = "all" | "attention" | "ready";

export function V2ScanLabExplorer({ evidenceGroups, signals, vendorPurposeSummary }: ExplorerProps) {
  const families = useMemo(() => uniqueStrings(signals.map((signal) => signal.family)).sort(), [signals]);
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");
  const [selectedSignalId, setSelectedSignalId] = useState(signals[0]?.id ?? "");
  const [reviewDisposition, setReviewDisposition] = useState<ReviewDisposition>("needs_review");
  const [scratchNote, setScratchNote] = useState("");

  const filteredSignals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return signals.filter((signal) => {
      if (familyFilter !== "all" && signal.family !== familyFilter) {
        return false;
      }
      const attention = signalNeedsAttention(signal);
      if (attentionFilter === "attention" && !attention) {
        return false;
      }
      if (attentionFilter === "ready" && attention) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        signal.id,
        signal.sourceFindingKey,
        signal.sourceRowId,
        signal.family,
        signal.lane,
        signal.simulatedPolicyOutcome,
        ...signal.vendorLabels,
        ...signal.supportingPurposes,
        ...signal.diagnosticPurposes,
        ...signal.sensitiveContextCategories,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [attentionFilter, familyFilter, query, signals]);

  const selectedSignal =
    filteredSignals.find((signal) => signal.id === selectedSignalId) ??
    filteredSignals[0] ??
    signals.find((signal) => signal.id === selectedSignalId) ??
    signals[0] ??
    null;
  const selectedEvidenceGroups = selectedSignal
    ? evidenceGroups
        .filter((group) => group.candidateFamily === selectedSignal.family)
        .slice(0, 8)
    : [];
  const selectedVendorRows = selectedSignal
    ? vendorPurposeSummary.filter((row) => selectedSignal.vendorLabels.includes(row.label)).slice(0, 8)
    : [];

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Candidate Signal Explorer</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Local review workspace for saved v2 artifacts. Filters and notes are browser-only and do not write report,
              checklist, score, or production concern data.
            </p>
          </div>
          <div className="grid min-w-56 grid-cols-3 gap-2 text-center text-xs">
            <ExplorerCount label="Shown" value={String(filteredSignals.length)} />
            <ExplorerCount label="Total" value={String(signals.length)} />
            <ExplorerCount label="Groups" value={String(evidenceGroups.length)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <ExplorerFilters
          attentionFilter={attentionFilter}
          families={families}
          familyFilter={familyFilter}
          query={query}
          setAttentionFilter={setAttentionFilter}
          setFamilyFilter={setFamilyFilter}
          setQuery={setQuery}
        />

        {signals.length === 0 ? (
          <p className="text-sm text-slate-500">No internal candidate signals were available in the selected artifact chain.</p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-3" data-testid="v2-scan-lab-signal-list">
              {filteredSignals.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No candidate signals match the current filters.
                </div>
              ) : (
                filteredSignals.map((signal, index) => (
                  <SignalRowButton
                    key={`${signal.id}:${index}`}
                    selected={selectedSignal?.id === signal.id}
                    signal={signal}
                    onSelect={() => setSelectedSignalId(signal.id)}
                  />
                ))
              )}
            </div>

            <SignalDetailPanel
              disposition={reviewDisposition}
              evidenceGroups={selectedEvidenceGroups}
              scratchNote={scratchNote}
              selectedVendorRows={selectedVendorRows}
              setDisposition={setReviewDisposition}
              setScratchNote={setScratchNote}
              signal={selectedSignal}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExplorerFilters({
  attentionFilter,
  families,
  familyFilter,
  query,
  setAttentionFilter,
  setFamilyFilter,
  setQuery,
}: {
  attentionFilter: AttentionFilter;
  families: string[];
  familyFilter: string;
  query: string;
  setAttentionFilter: (value: AttentionFilter) => void;
  setFamilyFilter: (value: string) => void;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_18rem]">
      <label className="block">
        <span className="text-xs uppercase text-slate-500">Search signals</span>
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          data-testid="v2-scan-lab-signal-search"
          placeholder="Vendor, family, purpose, lane"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase text-slate-500">Family</span>
        <select
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
          data-testid="v2-scan-lab-family-filter"
          value={familyFilter}
          onChange={(event) => setFamilyFilter(event.target.value)}
        >
          <option value="all">all families</option>
          {families.map((family) => (
            <option key={family} value={family}>{formatMachineLabel(family)}</option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-xs uppercase text-slate-500">Attention</p>
        <div className="mt-1 grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {[
            ["all", "All"],
            ["attention", "Review"],
            ["ready", "Ready"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                attentionFilter === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
              type="button"
              onClick={() => setAttentionFilter(value as AttentionFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalRowButton({
  onSelect,
  selected,
  signal,
}: {
  onSelect: () => void;
  selected: boolean;
  signal: V2ScanLabCandidateSignal;
}) {
  const attention = signalNeedsAttention(signal);
  return (
    <button
      className={`w-full rounded-lg border p-4 text-left transition ${
        selected
          ? "border-slate-950 bg-slate-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      data-testid={`v2-scan-lab-signal-${signal.id}`}
      type="button"
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words text-sm font-semibold text-slate-950">{formatMachineLabel(signal.family)}</span>
        <StatusPill tone={attention ? "warning" : "success"}>{attention ? "review" : "ready"}</StatusPill>
      </div>
      <p className="mt-2 break-all font-mono text-xs text-slate-500">{signal.sourceFindingKey}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <MiniMetric label="Groups" value={String(signal.evidenceGroupCount)} />
        <MiniMetric label="Refs" value={String(signal.unresolvedRefCount)} />
        <MiniMetric label="Warn" value={String(signal.warningCount)} />
      </div>
      <p className="mt-3 text-xs text-slate-500">{formatList(signal.vendorLabels, 4)}</p>
    </button>
  );
}

function SignalDetailPanel({
  disposition,
  evidenceGroups,
  scratchNote,
  selectedVendorRows,
  setDisposition,
  setScratchNote,
  signal,
}: {
  disposition: ReviewDisposition;
  evidenceGroups: V2ScanLabEvidenceGroup[];
  scratchNote: string;
  selectedVendorRows: V2ScanLabVendorPurposeSummary[];
  setDisposition: (value: ReviewDisposition) => void;
  setScratchNote: (value: string) => void;
  signal: V2ScanLabCandidateSignal | null;
}) {
  if (!signal) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        Select a candidate signal to inspect bounded evidence context.
      </div>
    );
  }

  const flags = [
    ...signal.sensitiveContextCategories.map((value) => `sensitive context: ${value}`),
    ...signal.coverageLimitations,
    ...signal.caveats,
  ];

  return (
    <div className="space-y-4" data-testid="v2-scan-lab-signal-detail">
      <div className="rounded-lg border border-slate-200 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-xl font-semibold text-slate-950">{formatMachineLabel(signal.family)}</h3>
              <StatusPill tone={signalNeedsAttention(signal) ? "warning" : "success"}>
                {signalNeedsAttention(signal) ? "review attention" : "artifact ready"}
              </StatusPill>
              <StatusPill tone="neutral">{signal.confidence} / {signal.directness}</StatusPill>
            </div>
            <p className="break-all font-mono text-xs text-slate-500">{signal.id}</p>
          </div>
          <div className="grid min-w-64 gap-2 text-xs sm:grid-cols-2">
            <MiniMetric label="Lane" value={formatMachineLabel(signal.lane)} />
            <MiniMetric label="Outcome" value={formatMachineLabel(signal.simulatedPolicyOutcome)} />
            <MiniMetric label="Resolved excerpts" value={String(signal.resolvedExcerptCount)} />
            <MiniMetric label="Source refs" value={String(signal.resolvedSourceRefCount)} />
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <TagList title="Vendors" values={signal.vendorLabels} />
          <TagList title="Purposes" values={[...signal.supportingPurposes, ...signal.diagnosticPurposes]} />
          <TagList title="Review flags" values={flags} />
        </div>

        {signal.topDisplaySafeExcerpts.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs uppercase text-slate-500">Display-safe evidence preview</p>
            {signal.topDisplaySafeExcerpts.map((excerpt, index) => (
              <p key={`${signal.id}:excerpt:${index}`} className="break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {excerpt}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="font-semibold text-slate-950">Local Reviewer Scratchpad</h4>
            <p className="mt-1 text-sm text-slate-600">
              Browser-only state for triage rehearsal. It is not saved and does not affect production eligibility.
            </p>
          </div>
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
            {[
              ["needs_review", "Review"],
              ["artifact_ready", "Ready"],
              ["hold", "Hold"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  disposition === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
                data-testid={`v2-scan-lab-disposition-${value}`}
                type="button"
                onClick={() => setDisposition(value as ReviewDisposition)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="mt-4 min-h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          data-testid="v2-scan-lab-scratch-note"
          placeholder="Internal reviewer notes for this browser session"
          value={scratchNote}
          onChange={(event) => setScratchNote(event.target.value)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RelatedEvidenceGroups groups={evidenceGroups} />
        <RelatedVendorRows rows={selectedVendorRows} />
      </div>
    </div>
  );
}

function RelatedEvidenceGroups({ groups }: { groups: V2ScanLabEvidenceGroup[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <h4 className="font-semibold text-slate-950">Related Evidence Groups</h4>
      <div className="mt-4 space-y-3">
        {groups.length === 0 ? <p className="text-sm text-slate-500">No related evidence groups found.</p> : null}
        {groups.map((group, index) => (
          <div key={`${group.groupId}:${index}`} className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
            <p className="font-medium text-slate-950">{group.groupLabel}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">{group.evidenceKind}</p>
            <p className="mt-2 text-xs text-slate-600">
              {group.sourceRefsCount} refs, {group.unresolvedRefsCount} unresolved, {group.warningCount} warnings
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedVendorRows({ rows }: { rows: V2ScanLabVendorPurposeSummary[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <h4 className="font-semibold text-slate-950">Related Vendor Purpose Rows</h4>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="text-sm text-slate-500">No related vendor rows found.</p> : null}
        {rows.map((row, index) => (
          <div key={`${row.label}:${index}`} className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-950">{row.label}</p>
              <span className="font-mono text-xs text-slate-500">{row.count}</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">{formatList(row.purposes, 8)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplorerCount({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-slate-950">{value}</p>
    </div>
  );
}

function TagList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{title}</p>
      {values.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">none</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.slice(0, 10).map((value, index) => (
            <span key={`${value}:${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "neutral" | "success" | "warning" }) {
  const classes = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function signalNeedsAttention(signal: V2ScanLabCandidateSignal) {
  return signal.unresolvedRefCount > 0 ||
    signal.warningCount > 0 ||
    signal.sensitiveContextCategories.length > 0 ||
    signal.coverageLimitations.length > 0 ||
    signal.caveats.length > 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function formatMachineLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatList(values: string[], limit = 8) {
  return values.length > 0 ? values.slice(0, limit).join(", ") : "none";
}
