"use client";

import { PLAN_CODES } from "@website-signal-risk-scanner/shared";
import { useFormStatus } from "react-dom";

type OrganizationPlanFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultPlan: "free" | "individual" | "pro" | "team";
  defaultPlanStatus: "active" | "trialing" | "past_due" | "paused";
  organizationId: string;
};

const PLAN_STATUSES = ["active", "trialing", "past_due", "paused"] as const;
const PLAN_LABELS: Record<(typeof PLAN_CODES)[number], string> = {
  free: "Free",
  individual: "Individual",
  pro: "Pro",
  team: "Ultra",
};

function PlanControls(props: Pick<OrganizationPlanFormProps, "defaultPlan" | "defaultPlanStatus">) {
  const { pending } = useFormStatus();

  return (
    <>
      <select
        className="w-[108px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-wait disabled:opacity-60"
        defaultValue={props.defaultPlan}
        disabled={pending}
        name="plan"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {PLAN_CODES.map((plan) => (
          <option key={plan} value={plan}>
            {PLAN_LABELS[plan]}
          </option>
        ))}
      </select>
      <select
        className="w-[128px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-wait disabled:opacity-60"
        defaultValue={props.defaultPlanStatus}
        disabled={pending}
        name="planStatus"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {PLAN_STATUSES.map((status) => (
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
    <form action={action} className="grid items-start gap-2 md:grid-cols-[108px_128px]" key={formKey}>
      <input name="organizationId" type="hidden" value={organizationId} />
      <PlanControls defaultPlan={defaultPlan} defaultPlanStatus={defaultPlanStatus} />
    </form>
  );
}
