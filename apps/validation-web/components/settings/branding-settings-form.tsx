"use client";

import { useActionState } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import { upsertOrganizationSettingsAction, type UpsertOrganizationSettingsActionState } from "../../server/settings/upsert-organization-settings";

type BrandingSettingsFormProps = {
  defaultValues: {
    defaultScanFrequency: string | null;
  };
};

const initialState: UpsertOrganizationSettingsActionState = {
  error: null,
  success: null
};

export function BrandingSettingsForm({ defaultValues }: BrandingSettingsFormProps) {
  const [state, action, isPending] = useActionState(upsertOrganizationSettingsAction, initialState);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="defaultScanFrequency">
          Default scan frequency
        </label>
        <select
          className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          defaultValue={defaultValues.defaultScanFrequency ?? ""}
          id="defaultScanFrequency"
          name="defaultScanFrequency"
        >
          <option value="">Use plan default</option>
          <option value="manual">Manual</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
