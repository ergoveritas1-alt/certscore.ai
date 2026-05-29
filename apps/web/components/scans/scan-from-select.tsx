"use client";

import { SCAN_FROM_DEFINITIONS, SCAN_FROM_VALUES, type ScanFrom } from "@website-signal-risk-scanner/shared";

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
        {SCAN_FROM_VALUES.map((scanFrom) => (
          <option key={scanFrom} value={scanFrom}>
            {SCAN_FROM_DEFINITIONS[scanFrom].label}
          </option>
        ))}
      </select>
    </label>
  );
}
