"use client";

export const SCAN_FROM_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "California", value: "california" },
  { label: "EU", value: "eu" },
  { label: "UK", value: "uk" }
] as const;

export type ScanFrom = (typeof SCAN_FROM_OPTIONS)[number]["value"];

type ScanFromSelectProps = {
  compact?: boolean;
  id?: string;
  name?: string;
  onChange?: (value: ScanFrom) => void;
  value?: ScanFrom;
};

export function ScanFromSelect({
  compact = false,
  id = "scanFrom",
  name = "scanFrom",
  onChange,
  value = "default"
}: ScanFromSelectProps) {
  return (
    <label className={compact ? "flex items-center gap-2 text-xs font-medium text-slate-600" : "block space-y-1.5"}>
      <span className={compact ? "shrink-0" : "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"}>
        Scan from
      </span>
      <select
        className={
          compact
            ? "h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
            : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        }
        id={id}
        name={name}
        onChange={(event) => onChange?.(event.target.value as ScanFrom)}
        value={value}
      >
        {SCAN_FROM_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
