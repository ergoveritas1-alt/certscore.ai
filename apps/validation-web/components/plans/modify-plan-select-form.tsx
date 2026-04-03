"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { useFormStatus } from "react-dom";

type ModifyPlanSelectFormProps = {
  action: (formData: FormData) => Promise<void>;
  isCurrent: boolean;
  plan: PlanCode;
};

function SubmitButton({ isCurrent }: { isCurrent: boolean }) {
  const { pending } = useFormStatus();

  if (isCurrent) {
    return (
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
        Current plan
      </div>
    );
  }

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      {pending ? "Updating..." : "Switch to this plan"}
    </Button>
  );
}

export function ModifyPlanSelectForm({ action, isCurrent, plan }: ModifyPlanSelectFormProps) {
  return (
    <form action={action}>
      <input name="plan" type="hidden" value={plan} />
      <SubmitButton isCurrent={isCurrent} />
    </form>
  );
}
