"use client";

import { useActionState } from "react";
import { submitValidationRescanFormAction, type ValidationRescanActionState } from "../../server/validation/actions";

const initialState: ValidationRescanActionState = {
  error: null
};

type ValidationRescanFormProps = {
  buttonClassName?: string;
  domainId: string;
  showIcon?: boolean;
};

export function ValidationRescanForm({
  buttonClassName = "inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950",
  domainId,
  showIcon = true
}: ValidationRescanFormProps) {
  const [state, action, isPending] = useActionState(submitValidationRescanFormAction, initialState);

  return (
    <form action={action} className="space-y-2">
      <input name="domainId" type="hidden" value={domainId} />
      {state.error ? <p className="max-w-sm text-sm text-red-600">{state.error}</p> : null}
      <button className={buttonClassName} disabled={isPending} type="submit">
        {showIcon ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        ) : null}
        <span>{isPending ? "Queueing..." : "Re-scan"}</span>
      </button>
    </form>
  );
}
