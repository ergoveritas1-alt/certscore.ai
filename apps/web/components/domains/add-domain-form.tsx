"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState } from "react";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";

const initialState: CreateDomainActionState = {
  error: null
};

type AddDomainFormProps = {
  maxDomains: number;
  planCode: string;
};

export function AddDomainForm({ maxDomains, planCode }: AddDomainFormProps) {
  const [state, action, isPending] = useActionState(createDomainAction, initialState);
  const planLabel = planCode === "free" ? "free" : planCode === "pro" ? "pro" : "ultra";

  return (
    <form action={action} className="space-y-5">
      <div>
        <div className="relative">
          <Input
            autoComplete="url"
            className="h-16 rounded-[2rem] border-slate-300 pr-44 text-2xl shadow-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-200"
            defaultValue=""
            id="domain"
            name="domain"
            placeholder="example.com"
            required
            type="text"
          />
          <Button
            aria-label="Start scanning"
            className="absolute right-3 top-1/2 h-12 -translate-y-1/2 rounded-full px-5 text-sm font-medium"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Starting..." : "Start scanning"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Your {planLabel} plan currently supports up to {maxDomains} connected website{maxDomains === 1 ? "" : "s"}.
      </p>

      {planCode === "free" ? (
        <p className="text-xs text-slate-500">
          Free includes one website and one homepage scan each month.
        </p>
      ) : null}

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
