"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import type { PlanCode } from "@website-signal-risk-scanner/shared/types/entities";
import { useFormStatus } from "react-dom";

type ModifyPlanSelectFormProps = {
  action: (formData: FormData) => Promise<void>;
  billingIntent: "checkout" | "current" | "portal";
  isCurrent: boolean;
  plan: PlanCode;
};

function SubmitButton({ billingIntent, isCurrent }: { billingIntent: ModifyPlanSelectFormProps["billingIntent"]; isCurrent: boolean }) {
  const { pending } = useFormStatus();

  if (isCurrent) {
    return (
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
        Current plan
      </div>
    );
  }

  const idleLabel = billingIntent === "portal" ? "Manage billing" : "Continue to checkout";
  const pendingLabel = billingIntent === "portal" ? "Opening..." : "Opening checkout...";

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

export function ModifyPlanSelectForm({ action, billingIntent, isCurrent, plan }: ModifyPlanSelectFormProps) {
  return (
    <form action={action}>
      {billingIntent === "portal" ? <input name="intent" type="hidden" value="manage_billing" /> : null}
      <input name="plan" type="hidden" value={plan} />
      <SubmitButton billingIntent={billingIntent} isCurrent={isCurrent} />
    </form>
  );
}
