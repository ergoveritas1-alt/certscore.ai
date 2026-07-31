"use client";

import { useFormStatus } from "react-dom";
import {
  ADMIN_PLAN_LABELS,
  ADMIN_PLAN_STATUSES,
  PLAN_CODES
} from "../../lib/admin/plan-options";

type OrganizationPlanFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultPlan: "free" | "individual" | "pro" | "team";
  defaultPlanStatus: "active" | "trialing" | "past_due" | "paused";
  organizationId: string;
};

function PlanControls(props: Pick<OrganizationPlanFormProps, "defaultPlan" | "defaultPlanStatus">) {
  const { pending } = useFormStatus();

  return (
    <>
      <select
        className="w-[96px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:cursor-wait disabled:opacity-60"
        defaultValue={props.defaultPlan}
        disabled={pending}
        name="plan"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {PLAN_CODES.map((plan) => (
          <option key={plan} value={plan}>
            {ADMIN_PLAN_LABELS[plan]}
          </option>
        ))}
      </select>
      <select
        className="w-[110px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:cursor-wait disabled:opacity-60"
        defaultValue={props.defaultPlanStatus}
        disabled={pending}
        name="planStatus"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {ADMIN_PLAN_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </>
  );
}

export function OrganizationPlanForm({ action, defaultPlan, defaultPlanStatus, organizationId }: OrganizationPlanFormProps) {
  const formKey = `${organizationId}:${defaultPlan}:${defaultPlanStatus}`;

  return (
    <form action={action} className="grid items-start gap-1.5 md:grid-cols-[96px_110px]" key={formKey}>
      <input name="organizationId" type="hidden" value={organizationId} />
      <PlanControls defaultPlan={defaultPlan} defaultPlanStatus={defaultPlanStatus} />
      <PlanSaveStatus />
    </form>
  );
}

function PlanSaveStatus() {
  const { pending } = useFormStatus();
  return pending ? <span aria-live="polite" className="text-xs text-slate-500">Saving…</span> : null;
}
