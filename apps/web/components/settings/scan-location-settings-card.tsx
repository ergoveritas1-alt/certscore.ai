"use client";

import { useActionState } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import type { ScanFrom } from "@website-signal-risk-scanner/shared";
import {
  upsertOrganizationSettingsAction,
  type UpsertOrganizationSettingsActionState
} from "../../server/settings/upsert-organization-settings";
import { ScanFromMarker } from "../scans/scan-from-icons";

const SCAN_LOCATION_OPTIONS = [
  {
    city: "Dublin",
    flag: "🇮🇪",
    label: "EU-IR",
    value: "eu_ie"
  },
  {
    city: "Frankfurt",
    flag: "🇩🇪",
    label: "EU-DE",
    value: "eu_de"
  },
  {
    city: "US West",
    flag: "california",
    label: "California",
    value: "california"
  }
] as const satisfies Array<{
  city: string;
  flag: "🇮🇪" | "🇩🇪" | "california";
  label: string;
  value: ScanFrom;
}>;

const initialState: UpsertOrganizationSettingsActionState = {
  error: null,
  success: null
};

export function ScanLocationSettingsCard({
  lastScanFrom
}: {
  lastScanFrom: ScanFrom;
}) {
  const [state, action, isPending] = useActionState(upsertOrganizationSettingsAction, initialState);
  const selectedScanFrom = lastScanFrom === "default" ? "eu_ie" : lastScanFrom;

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5">
          {SCAN_LOCATION_OPTIONS.map((option) => (
            <label className="group flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent px-2 py-2.5 text-slate-600 transition has-[:checked]:border-sky-200 has-[:checked]:bg-white has-[:checked]:text-slate-950 has-[:checked]:shadow-sm hover:bg-white/70" key={option.value} title={`${option.city} Lambda scanner`}>
              <input className="peer sr-only" defaultChecked={selectedScanFrom === option.value} name="defaultScanFrom" type="radio" value={option.value} />
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm"><ScanFromMarker flag={option.flag} selected /></span>
              <span className="min-w-0 text-left leading-tight"><span className="block truncate text-xs font-semibold">{option.label}</span><span className="block truncate text-[10px] text-slate-400">{option.city}</span></span>
            </label>
          ))}
        </div>
        <Button
          className="shrink-0 self-center border-0 bg-transparent px-2 text-xs font-medium text-slate-500 shadow-none ring-0 hover:bg-slate-100 hover:text-slate-900"
          disabled={isPending}
          size="sm"
          type="submit"
          variant="secondary"
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {(state.error || state.success) ? (
        <div aria-live="polite">
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
