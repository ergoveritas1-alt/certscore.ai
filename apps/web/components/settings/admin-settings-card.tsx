"use client";

import { useActionState } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import {
  updateAdminSettingsAction,
  type UpdateAdminSettingsActionState
} from "../../server/settings/update-admin-settings";

type AdminSettingsCardProps = {
  showSignalSnapshotFingerprinting: boolean;
  showSignalSnapshotReviewLenses: boolean;
  showSignalSnapshotScanInterruption: boolean;
};

const SIGNAL_SNAPSHOT_TOGGLES = [
  {
    description: "Review lens scoring and mapped regulatory context.",
    label: "Review lenses card",
    name: "showSignalSnapshotReviewLenses"
  },
  {
    description: "Coverage limitation details from retained interruption evidence.",
    label: "Scan Interruption card",
    name: "showSignalSnapshotScanInterruption"
  },
  {
    description: "Fingerprinting indicators retained by the scan.",
    label: "Fingerprinting card",
    name: "showSignalSnapshotFingerprinting"
  }
] as const;

const initialAdminSettingsActionState: UpdateAdminSettingsActionState = {
  error: null,
  success: null
};

export function AdminSettingsCard({
  showSignalSnapshotFingerprinting,
  showSignalSnapshotReviewLenses,
  showSignalSnapshotScanInterruption
}: AdminSettingsCardProps) {
  const [state, action, isPending] = useActionState(updateAdminSettingsAction, initialAdminSettingsActionState);
  const defaults = {
    showSignalSnapshotFingerprinting,
    showSignalSnapshotReviewLenses,
    showSignalSnapshotScanInterruption
  };

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-3">
        {SIGNAL_SNAPSHOT_TOGGLES.map((toggle) => (
          <label
            key={toggle.name}
            className="flex min-h-28 cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 transition hover:border-slate-300"
          >
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-semibold text-slate-950">{toggle.label}</span>
              <span className="block text-sm leading-6 text-slate-600">{toggle.description}</span>
            </span>
            <span className="relative mt-1 inline-flex h-6 w-11 shrink-0 items-center">
              <input
                aria-label={toggle.label}
                className="peer sr-only"
                defaultChecked={defaults[toggle.name]}
                name={toggle.name}
                role="switch"
                type="checkbox"
              />
              <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-slate-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500" />
              <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
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
          {isPending ? "Saving..." : "Save admin settings"}
        </Button>
      </div>
    </form>
  );
}
