"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useRef, useState } from "react";
import { confirmPasswordResetAction } from "../../server/auth-flows/password-reset-actions";
import { initialPasswordResetConfirmState } from "../../server/auth-flows/reset-action-state";

export function ResetPasswordUpdateForm() {
  const searchParams = useSearchParams();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const token = searchParams?.get("token") ?? "";
  const callbackError = searchParams?.get("error");
  const [state, formAction, isPending] = useActionState(confirmPasswordResetAction, initialPasswordResetConfirmState);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const invalidToken = token.length === 0 || callbackError === "INVALID_TOKEN";

  if (invalidToken) {
    return (
      <div className="space-y-6">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path
              d="M12 8v4l2.5 1.5M19.5 12a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Password reset</p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">This reset link is no longer valid</h1>
          <p className="text-sm leading-6 text-slate-600">
            Reset links expire after 24 hours for your security. Request a new link to choose a new password.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            className="flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/reset-password"
          >
            Request a new reset link
          </Link>
          <Link
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            href="/login"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">Choose a new password</h1>
        <p className="text-sm text-slate-600">Enter a new password for your CertScore.ai account.</p>
      </div>

      <form action={formAction} className="space-y-4">
        <input name="token" type="hidden" value={token} />
        <label className="space-y-2 text-sm font-medium text-slate-700">
          New password
          <div className="relative">
            <Input
              ref={passwordInputRef}
              autoComplete="new-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a new password"
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 transition hover:text-slate-900"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {state.fieldErrors.password ? <p className="text-sm text-red-600">{state.fieldErrors.password}</p> : null}
        {state.fieldErrors.token ? <p className="text-sm text-red-600">{state.fieldErrors.token}</p> : null}
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

        <Button
          className="w-full"
          disabled={isPending || password.length === 0}
          type="submit"
          variant="secondary"
        >
          Reset password
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
