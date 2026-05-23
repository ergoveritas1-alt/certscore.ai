"use client";

import { useMemo, useState } from "react";

type TrendPoint = {
  completedCount: number;
  findingsPerCompleted: number | null;
  pagesScanned: number;
  targetScanCount: number;
  windowCount: number;
  zeroFindingRate: number | null;
};

type TrendSeriesPoint = {
  cumulativeCompletedCount: number;
  completedAt: string | null;
  completedCount: number;
  findingsPerCompleted: number;
  pagesScanned: number;
  zeroFindingRate: number;
};

type ScannerQualityTrendCardProps = {
  trend: {
    egressId: string;
    egressProvider: string | null;
    latestWindowAt: string | null;
    points: TrendPoint[];
    scopeLabel: string;
    series: TrendSeriesPoint[];
  };
};

const RANGE_OPTIONS = [20, 50, 100, 500, 2000, "all-time"] as const;

type RangeOption = (typeof RANGE_OPTIONS)[number];

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }
  return value.toFixed(2);
}

function formatRangeLabel(value: RangeOption) {
  return value === "all-time" ? "All-time" : `${value}`;
}

function buildTrendPath(
  points: Array<{ xValue: number; yValue: number }>,
  width = 520,
  height = 150,
  yMin = 0,
  yMax = 1
) {
  if (points.length < 2) {
    return "";
  }
  const minX = Math.min(...points.map((point) => point.xValue));
  const maxX = Math.max(...points.map((point) => point.xValue));
  const xRange = maxX - minX || 1;
  const yRange = yMax - yMin || 1;
  return points
    .map((point) => {
      const x = 42 + ((point.xValue - minX) / xRange) * width;
      const y = 12 + (1 - (point.yValue - yMin) / yRange) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function sliceSeriesByRange(series: TrendSeriesPoint[], range: RangeOption) {
  if (range === "all-time") {
    return series;
  }
  const latest = series.at(-1);
  if (!latest) {
    return [];
  }
  const minCumulativeScan = Math.max(0, latest.cumulativeCompletedCount - range);
  const sliced = series.filter((point) => point.cumulativeCompletedCount > minCumulativeScan);
  if (sliced.length >= 2) {
    return sliced;
  }
  return series.slice(-2);
}

export function ScannerQualityTrendCard({ trend }: ScannerQualityTrendCardProps) {
  const [range, setRange] = useState<RangeOption>("all-time");
  const series = useMemo(() => sliceSeriesByRange(trend.series, range), [range, trend.series]);
  const findingValues = series.map((point) => point.findingsPerCompleted);
  const findingMax = Math.max(1, ...findingValues);
  const latestPoint = series.at(-1);
  const firstPoint = series[0];
  const completedInView = series.reduce((sum, point) => sum + point.completedCount, 0);
  const pagesInView = series.reduce((sum, point) => sum + point.pagesScanned, 0);
  const findingLine = buildTrendPath(
    series.map((point) => ({ xValue: point.cumulativeCompletedCount, yValue: point.findingsPerCompleted })),
    520,
    150,
    0,
    findingMax
  );
  const zeroLine = buildTrendPath(
    series.map((point) => ({ xValue: point.cumulativeCompletedCount, yValue: point.zeroFindingRate })),
    520,
    150,
    0,
    1
  );
  const firstScanCount = firstPoint?.cumulativeCompletedCount ?? 0;
  const latestScanCount = latestPoint?.cumulativeCompletedCount ?? 0;
  const midScanCount = Math.round((firstScanCount + latestScanCount) / 2);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-950">
            {trend.egressId} / {trend.egressProvider ?? "unknown"}
          </h3>
          <p className="text-sm text-slate-500">Latest durable window: {trend.latestWindowAt ?? "unknown"}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{trend.scopeLabel}</span>
      </div>
      <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-900">Window trend</span>
          <span className="text-xs text-slate-500">
            {completedInView} scans · {series.length} window{series.length === 1 ? "" : "s"} · {pagesInView} pages · latest{" "}
            {latestPoint ? `${formatNumber(latestPoint.findingsPerCompleted)} findings/completed, ${formatRate(latestPoint.zeroFindingRate)} zero-finding` : "unknown"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Trend scan range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                range === option ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              ].join(" ")}
            >
              {formatRangeLabel(option)}
            </button>
          ))}
        </div>
        {series.length < 2 ? (
          <p className="mt-3 text-sm text-slate-600">Need at least 2 durable windows before a trend line can move.</p>
        ) : (
          <div className="mt-3">
            <svg className="h-56 w-full" viewBox="0 0 620 210" role="img" aria-label={`${trend.egressId} combined scanner quality trend`}>
              <line x1="42" y1="162" x2="562" y2="162" stroke="#cbd5e1" strokeWidth="1" />
              <line x1="42" y1="87" x2="562" y2="87" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="42" y1="12" x2="562" y2="12" stroke="#e2e8f0" strokeWidth="1" />
              <line x1="42" y1="12" x2="42" y2="162" stroke="#cbd5e1" strokeWidth="1" />
              <line x1="562" y1="12" x2="562" y2="162" stroke="#cbd5e1" strokeWidth="1" />

              <text x="0" y="16" fill="#059669" fontSize="10">{formatNumber(findingMax)}</text>
              <text x="0" y="91" fill="#059669" fontSize="10">{formatNumber(findingMax / 2)}</text>
              <text x="8" y="166" fill="#059669" fontSize="10">0.00</text>
              <text x="572" y="16" fill="#d97706" fontSize="10">100%</text>
              <text x="572" y="91" fill="#d97706" fontSize="10">50%</text>
              <text x="572" y="166" fill="#d97706" fontSize="10">0%</text>

              <polyline points={findingLine} fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={zeroLine} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

              <line x1="42" y1="162" x2="42" y2="168" stroke="#94a3b8" strokeWidth="1" />
              <line x1="302" y1="162" x2="302" y2="168" stroke="#94a3b8" strokeWidth="1" />
              <line x1="562" y1="162" x2="562" y2="168" stroke="#94a3b8" strokeWidth="1" />
              <text x="42" y="184" textAnchor="middle" fill="#64748b" fontSize="10">{firstScanCount} scans</text>
              <text x="302" y="184" textAnchor="middle" fill="#64748b" fontSize="10">{midScanCount} scans</text>
              <text x="562" y="184" textAnchor="middle" fill="#64748b" fontSize="10">{latestScanCount} scans</text>
              <text x="302" y="204" textAnchor="middle" fill="#64748b" fontSize="10">
                {firstPoint?.completedAt ?? "oldest"} to {latestPoint?.completedAt ?? "latest"}
              </text>
            </svg>
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>Left axis: findings/completed</span>
              <span>Right axis: zero-finding rate</span>
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-emerald-500" /> findings/completed</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-amber-500" /> zero-finding rate</span>
        </div>
      </div>
    </div>
  );
}
