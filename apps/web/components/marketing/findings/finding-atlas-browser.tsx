"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardContent } from "@website-signal-risk-scanner/ui";
import { ValidationFindingJsonPane } from "../../validation/validation-finding-json-pane";
import type { FindingAtlasItem } from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingAtlasItem[];
  compact?: boolean;
};

const severityClasses = {
  critical: "border-rose-200 bg-rose-50 text-rose-800",
  high: "border-amber-200 bg-amber-50 text-amber-900",
  medium: "border-sky-200 bg-sky-50 text-sky-800",
  low: "border-slate-200 bg-slate-50 text-slate-700"
} as const;

function formatDensity(value: number) {
  return `${value.toFixed(value < 1 ? 1 : 0)}%`;
}

function FindingIcon({ index, selected }: { index: number; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        selected
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
      }
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

function DensityBars({ item }: { item: FindingAtlasItem }) {
  const maxValue = Math.max(...item.trancoSlices.map((slice) => slice.value), item.benchmark.densityPct, 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Density</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {formatDensity(item.benchmark.densityPct)}
          </p>
        </div>
        <p className="max-w-[14rem] text-right text-xs leading-5 text-slate-500">
          {item.benchmark.positiveCount} of {item.benchmark.sampleSize} recent scan samples.
        </p>
      </div>
      <div className="grid gap-2">
        {item.trancoSlices.map((slice) => {
          const width = `${Math.max(6, (slice.value / maxValue) * 100)}%`;

          return (
            <div key={slice.label} className="grid grid-cols-[5.25rem_1fr_3rem] items-center gap-3">
              <p className="text-xs font-medium text-slate-500">{slice.label}</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0f8bd7_0%,#62c5ee_100%)]"
                  style={{ width }}
                />
              </div>
              <p className="text-right text-xs font-medium text-slate-600">{formatDensity(slice.value)}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Slice bars show directional distribution across Tranco-style rank bands; the headline density uses the retained production benchmark sample.
      </p>
    </div>
  );
}

export function FindingAtlasBrowser({ findings, compact = false }: FindingAtlasBrowserProps) {
  const [selectedId, setSelectedId] = useState(findings[0]?.id ?? "");
  const selected = useMemo(
    () => findings.find((finding) => finding.id === selectedId) ?? findings[0],
    [findings, selectedId]
  );

  if (!selected) {
    return null;
  }

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white shadow-none">
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Finding atlas</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Top 19 automated findings with evidence examples
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              Select a finding to review what it means, how often it appears in recent scan samples, mitigation paths, key metadata, and sample JSON evidence.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 text-center shadow-sm sm:min-w-[21rem]">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-semibold text-slate-950">{findings.length}</p>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Findings</p>
            </div>
            <div className="rounded-xl bg-sky-50 px-3 py-2">
              <p className="text-lg font-semibold text-sky-800">355</p>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Samples</p>
            </div>
            <div className="rounded-xl bg-slate-950 px-3 py-2">
              <p className="text-lg font-semibold text-white">JSON</p>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-300">Evidence</p>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="grid gap-0 p-0 lg:grid-cols-[22rem_1fr]">
        <div className="border-b border-slate-200 bg-slate-50 p-3 lg:max-h-[50rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {findings.map((finding, index) => {
              const selectedFinding = finding.id === selected.id;

              return (
                <button
                  key={finding.id}
                  type="button"
                  data-finding-id={finding.id}
                  onClick={() => setSelectedId(finding.id)}
                  className={
                    selectedFinding
                      ? "rounded-2xl border border-sky-200 bg-white p-3 text-left shadow-sm ring-1 ring-sky-100"
                      : "rounded-2xl border border-transparent bg-transparent p-3 text-left transition hover:border-slate-200 hover:bg-white"
                  }
                >
                  <div className="flex items-start gap-3">
                    <FindingIcon index={index} selected={selectedFinding} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold leading-5 text-slate-950">{finding.label}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400 ring-1 ring-slate-200">
                          {formatDensity(finding.benchmark.densityPct)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{finding.shortDescription}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityClasses[selected.severity]}`}>
                    {selected.severity}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {selected.section}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{selected.id}</span>
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{selected.label}</h3>
                <p className="text-sm leading-7 text-slate-600">{selected.shortDescription}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Why it matters</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selected.whyItMatters}</p>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Mitigation</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selected.mitigation}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Sample JSON evidence</p>
                  <p className="text-xs text-slate-400">{selected.sample.sourceLabel}</p>
                </div>
                <div className="overflow-hidden rounded-xl bg-white">
                  <ValidationFindingJsonPane payload={JSON.stringify(selected.sample.payload, null, 2)} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <DensityBars item={selected} />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Key metadata</p>
                <div className="mt-3 divide-y divide-slate-200">
                  {selected.metadata.map((item) => (
                    <div key={item.label} className="grid grid-cols-[7rem_1fr] gap-3 py-2 text-sm">
                      <p className="text-slate-500">{item.label}</p>
                      <p className="font-medium text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              {!compact ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500">
                  Density is directional product context from recent CertScore scan samples. It is not a legal benchmark, a guarantee, or a determination about any specific site.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
