"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitCredentialsAction } from "../../server/auth-flows/credentials-actions";
import { initialCredentialsActionState, type CredentialsActionState } from "../../server/auth-flows/action-state";

type AuthMode = CredentialsActionState["mode"];

function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function LoginForm(input?: {
  allowedEmail?: string;
  allowCreateAccount?: boolean;
  allowGoogle?: boolean;
  footerMode?: "default" | "hidden";
  title?: string;
}) {
  const searchParams = useSearchParams();
  const nextPath = getSafeRedirectPath(searchParams?.get("next") ?? null);
  const allowCreateAccount = input?.allowCreateAccount ?? true;
  const initialMessage = searchParams?.get("message") ?? null;
  const initialError = searchParams?.get("error") ?? null;
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientEmailError, setClientEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    initialMessage === "email_verified"
      ? "Email verified."
      : initialMessage === "password_reset"
        ? "Password updated. Sign in with your new password."
        : initialMessage === "signed_out"
          ? "Signed out."
          : null
  );
  const [flowError, setFlowError] = useState<string | null>(
    initialError === "invalid_verification_link"
      ? "That verification link is invalid or expired."
      : initialError === "magic_link_disabled" || initialError === "auth_callback_disabled"
        ? "This sign-in method is no longer available."
        : initialError === "google_sign_in_failed" ||
            initialError === "oauth_provider_not_found" ||
            initialError === "invalid_code" ||
            initialError === "no_callback_url" ||
            initialError === "unable_to_get_user_info"
          ? "Google sign-in could not be completed. Try again."
        : initialError
  );
  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [actionState, formAction, isPending] = useActionState(submitCredentialsAction, initialCredentialsActionState);
  const fieldErrors = actionState.mode === mode ? actionState.fieldErrors : {};
  const actionError = actionState.mode === mode ? actionState.error : null;

  useEffect(() => {
    if (!allowCreateAccount && mode === "create_account") {
      setMode("sign_in");
      setCreateStep(1);
    }
  }, [allowCreateAccount, mode]);

  useEffect(() => {
    if (mode === "create_account" && createStep === 2) {
      passwordInputRef.current?.focus();
      return;
    }

    emailInputRef.current?.focus();
  }, [mode, createStep]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setClientEmailError(null);
    setFlowError(null);
    setStatus(null);
    setPassword("");
    setShowPassword(false);

    if (nextMode === "create_account") {
      setCreateStep(1);
    }
  }

  async function handleCreateContinue(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== "create_account" || createStep !== 1) {
      return;
    }

    event.preventDefault();
    setStatus(null);
    setFlowError(null);

    if (!isValidEmail(email)) {
      setClientEmailError("Enter a valid email address.");
      return;
    }

    setClientEmailError(null);
    setCreateStep(2);
  }

  const isCreateAccount = mode === "create_account";
  const isCreatePasswordStep = isCreateAccount && createStep === 2;
  const isSubmitting = isPending;

  return (
    <div className="space-y-[10px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-[13px] font-semibold text-sky-700 ring-1 ring-sky-200">
            →
          </span>
          <span className="truncate text-xl font-semibold tracking-tight text-slate-950">
            {input?.title ?? "Access your workspace"}
          </span>
        </div>

        {allowCreateAccount ? (
          <div className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => switchMode("sign_in")}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                mode === "sign_in" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
              ].join(" ")}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("create_account")}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                mode === "create_account" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
              ].join(" ")}
            >
              Create account
            </button>
          </div>
        ) : null}
      </div>

      {input?.allowedEmail ? (
        <p className="text-sm text-slate-600">Validation Ops access is restricted to {input.allowedEmail}.</p>
      ) : null}

      <form action={formAction} className="space-y-4" onSubmit={handleCreateContinue}>
        <input name="mode" type="hidden" value={mode} />
        <input name="next" type="hidden" value={nextPath} />

        {isCreatePasswordStep ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateStep(1);
                  setPassword("");
                }}
                className="text-xs font-medium text-sky-700 transition hover:text-sky-800"
              >
                Change
              </button>
            </div>
            <input name="email" type="hidden" value={email} />
          </div>
        ) : (
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Email address
            <Input
              ref={emailInputRef}
              autoComplete="email"
              autoFocus={mode !== "create_account" || createStep === 1}
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                setClientEmailError(null);
              }}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </label>
        )}

        {!isCreateAccount || isCreatePasswordStep ? (
          <label className="relative block space-y-2 text-sm font-medium text-slate-700">
            <div className="pr-40">
              <span>Password</span>
            </div>
            <div className="relative">
              <Input
                ref={passwordInputRef}
                autoComplete={isCreateAccount ? "new-password" : "current-password"}
                autoFocus={isCreatePasswordStep}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isCreateAccount ? "Create a password" : "Enter your password"}
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
            {!isCreateAccount ? (
              <Link
                className="absolute right-0 top-0 text-xs font-medium text-sky-700 transition hover:text-sky-800"
                href={email.trim().length > 0 ? `/reset-password?email=${encodeURIComponent(email.trim())}` : "/reset-password"}
              >
                Forgot your password?
              </Link>
            ) : null}
          </label>
        ) : null}

        {clientEmailError ? <p className="text-sm text-red-600">{clientEmailError}</p> : null}
        {actionState.accountRecovery ? <p className="text-sm text-sky-700">{actionState.accountRecovery.hint}</p> : null}
        {fieldErrors.email ? <p className="text-sm text-red-600">{fieldErrors.email}</p> : null}
        {fieldErrors.password ? <p className="text-sm text-red-600">{fieldErrors.password}</p> : null}

        <div style={{ marginTop: "10px" }}>
          <Button
            className="w-full"
            disabled={
              isSubmitting ||
              email.trim().length === 0 ||
              ((!isCreateAccount || isCreatePasswordStep) && password.length === 0)
            }
            type="submit"
            variant="secondary"
          >
            {isCreateAccount ? (isCreatePasswordStep ? "Request access" : "Continue") : "Sign in"}
          </Button>
        </div>

        {allowCreateAccount && isCreateAccount ? <p className="text-xs text-slate-500">No credit card required.</p> : null}
      </form>

      {input?.allowGoogle ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Or continue with</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <Link
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            href={`/auth/google?next=${encodeURIComponent(nextPath)}`}
          >
            Google
          </Link>
        </div>
      ) : null}

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      {allowCreateAccount && input?.footerMode !== "hidden" ? (
        <div className="-mx-6 -mb-6 border-t border-slate-200 bg-slate-50 px-6 py-3 text-center">
          <p className="text-xs leading-4 text-slate-600">
            {mode === "create_account" ? "Already have an account? " : "Need an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "create_account" ? "sign_in" : "create_account")}
              className="font-medium text-sky-700 transition hover:text-sky-800"
            >
              {mode === "create_account" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      ) : null}

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {flowError ? <p className="text-sm text-red-600">{flowError}</p> : null}
    </div>
  );
}
