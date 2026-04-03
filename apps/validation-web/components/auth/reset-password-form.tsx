"use client";

import Link from "next/link";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useRef, useState } from "react";
import { requestPasswordResetAction } from "../../server/password-auth/reset-actions";
import { initialPasswordResetRequestState } from "../../server/password-auth/reset-action-state";

type ResetPasswordFormProps = {
  email?: string;
};

export function ResetPasswordForm({ email = "" }: ResetPasswordFormProps) {
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const [emailValue, setEmailValue] = useState(email);
  const [requestState, requestAction, isRequestPending] = useActionState(
    requestPasswordResetAction,
    initialPasswordResetRequestState
  );

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">Reset your password</h1>
        <p className="text-sm text-slate-600">Enter your email and we&apos;ll send you a secure reset link.</p>
      </div>

      <form action={requestAction} className="space-y-4">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Email address
          <Input
            ref={emailInputRef}
            autoComplete="email"
            name="email"
            onChange={(event) => setEmailValue(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={emailValue}
          />
        </label>

        {requestState.fieldErrors.email ? <p className="text-sm text-red-600">{requestState.fieldErrors.email}</p> : null}
        {requestState.error ? <p className="text-sm text-red-600">{requestState.error}</p> : null}
        {requestState.message ? <p className="text-sm text-emerald-700">{requestState.message}</p> : null}

        <Button className="w-full" disabled={isRequestPending || emailValue.trim().length === 0} type="submit" variant="secondary">
          Send reset link
        </Button>
      </form>

      <p className="text-sm text-slate-600">
        Back to{" "}
        <Link className="font-medium text-sky-700 transition hover:text-sky-800" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
