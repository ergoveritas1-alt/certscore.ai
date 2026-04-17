"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useRef, useState } from "react";
import { confirmPasswordResetAction } from "../../server/password-auth/reset-actions";
import { initialPasswordResetConfirmState } from "../../server/password-auth/reset-action-state";

export function ResetPasswordUpdateForm() {
  const searchParams = useSearchParams();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const token = searchParams?.get("token") ?? "";
  const [state, formAction, isPending] = useActionState(confirmPasswordResetAction, initialPasswordResetConfirmState);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const invalidToken = token.length === 0;

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

        {invalidToken ? <p className="text-sm text-red-600">This reset link is invalid or expired.</p> : null}
        {state.fieldErrors.password ? <p className="text-sm text-red-600">{state.fieldErrors.password}</p> : null}
        {state.fieldErrors.token ? <p className="text-sm text-red-600">{state.fieldErrors.token}</p> : null}
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

        <Button
          className="w-full"
          disabled={isPending || invalidToken || password.length === 0}
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
