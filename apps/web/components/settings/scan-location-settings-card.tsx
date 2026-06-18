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
    description: "Dublin Lambda scanner",
    flag: "🇮🇪",
    label: "EU-IR",
    value: "eu_ie"
  },
  {
    description: "Frankfurt Lambda scanner",
    flag: "🇩🇪",
    label: "EU-DE",
    value: "eu_de"
  },
  {
    description: "US-West Lambda scanner",
    flag: "california",
    label: "California",
    value: "california"
  }
] as const satisfies Array<{
  description: string;
  flag: "🇮🇪" | "🇩🇪" | "california";
  label: string;
  value: ScanFrom;
}>;

const initialState: UpsertOrganizationSettingsActionState = {
  error: null,
  success: null
};

export function ScanLocationSettingsCard({ lastScanFrom }: { lastScanFrom: ScanFrom }) {
  const [state, action, isPending] = useActionState(upsertOrganizationSettingsAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {SCAN_LOCATION_OPTIONS.map((option) => (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 transition has-[:checked]:border-sky-300 has-[:checked]:bg-sky-50/70 hover:border-slate-300"
            key={option.value}
          >
            <input
              className="peer sr-only"
              defaultChecked={lastScanFrom === option.value}
              name="defaultScanFrom"
              type="radio"
              value={option.value}
            />
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-sm">
              <ScanFromMarker flag={option.flag} selected />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-950">{option.label}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save last scan location"}
        </Button>
      </div>
    </form>
  );
}
