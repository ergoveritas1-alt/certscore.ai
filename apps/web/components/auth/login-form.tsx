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

function getInitialFlowError(initialError: string | null) {
  if (initialError === "invalid_verification_link") {
    return "That verification link is invalid or expired.";
  }

  if (initialError === "magic_link_disabled" || initialError === "auth_callback_disabled") {
    return "This sign-in method is no longer available.";
  }

  if (initialError === "signup_disabled" || initialError === "signup-disabled" || initialError === "signup disabled") {
    return "New account creation is temporarily paused.";
  }

  if (initialError === "access_denied" || initialError === "account_access_limited") {
    return "CertScore.ai account access is temporarily limited. Contact support if you need access.";
  }

  if (
    initialError === "google_sign_in_failed" ||
    initialError === "oauth_provider_not_found" ||
    initialError === "invalid_code" ||
    initialError === "no_callback_url" ||
    initialError === "unable_to_get_user_info"
  ) {
    return "Google sign-in could not be completed. Try again.";
  }

  return initialError;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.52 5.52 0 0 1-2.39 3.62v3h3.88c2.27-2.08 3.56-5.15 3.56-8.65Z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.88-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.1-6.72-4.93H1.27v3.09A12 12 0 0 0 12 24Z"
        fill="#34A853"
      />
      <path
        d="M5.28 14.32A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.58.37-2.32V6.59H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.41l4.01-3.09Z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.59l4.01 3.09c.95-2.83 3.6-4.91 6.72-4.91Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginForm(input?: {
  allowedEmail?: string;
  allowCreateAccount?: boolean;
  allowGoogle?: boolean;
  footerMode?: "default" | "hidden";
}) {
  const searchParams = useSearchParams();
  const nextPath = getSafeRedirectPath(searchParams?.get("next") ?? null);
  const allowCreateAccount = input?.allowCreateAccount ?? true;
  const initialMessage = searchParams?.get("message") ?? null;
  const initialError = searchParams?.get("error") ?? null;
  const requestedMode = searchParams?.get("mode") ?? null;
  const initialMode: AuthMode =
    allowCreateAccount && (requestedMode === "create_account" || requestedMode === "create") ? "create_account" : "sign_in";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [clientEmailError, setClientEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    initialMessage === "email_verified"
      ? "Email verified."
      : initialMessage === "password_reset"
        ? "Password updated. Sign in with your new password."
        : initialMessage === "signed_out"
          ? "You’ve been signed out."
          : null
  );
  const [flowError, setFlowError] = useState<string | null>(getInitialFlowError(initialError));
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
    setSubmittedEmail(null);
    setShowPassword(false);

    if (nextMode === "create_account") {
      setCreateStep(1);
    }
  }

  async function handleCreateContinue(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== "create_account" || createStep !== 1) {
      setSubmittedEmail(email.trim().toLowerCase());
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
  const actionMatchesCurrentEmail = submittedEmail === email.trim().toLowerCase();
  const currentAccountRecovery = actionMatchesCurrentEmail ? actionState.accountRecovery : null;
  const currentActionError = actionMatchesCurrentEmail ? actionError : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">Account access</h2>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{isCreateAccount ? "Create your workspace" : "Welcome back"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {isCreateAccount ? "Start with a focused, evidence-led review." : "Sign in to continue reviewing your workspace."}
          </p>
        </div>

        {allowCreateAccount ? (
          <div className="inline-flex shrink-0 rounded-full border border-slate-200/90 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <button
              type="button"
              onClick={() => switchMode("sign_in")}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition",
                mode === "sign_in"
                  ? "bg-white text-slate-950 shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
                  : "text-slate-500 hover:text-slate-950"
              ].join(" ")}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("create_account")}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition",
                mode === "create_account"
                  ? "bg-white text-slate-950 shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
                  : "text-slate-500 hover:text-slate-950"
              ].join(" ")}
            >
              Create account
            </button>
          </div>
        ) : null}
      </div>

      {status ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {status}
        </p>
      ) : null}
      {flowError ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {flowError}
        </p>
      ) : null}

      {input?.allowedEmail ? (
        <p className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-slate-600">
          Validation Ops access is restricted to {input.allowedEmail}.
        </p>
      ) : null}

      {input?.allowGoogle ? (
        <div className="space-y-4">
          <a
            className="group flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-3 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-[linear-gradient(180deg,#ffffff_0%,#f3f8ff_100%)] hover:shadow-[0_8px_24px_rgba(59,130,246,0.08)]"
            href={`/auth/google?next=${encodeURIComponent(nextPath)}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition group-hover:border-slate-300">
              <GoogleMark />
            </span>
            <span className="tracking-[0.01em]">Continue with Google</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Or use email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
      ) : null}

      <form
        action={formAction}
        className="space-y-4 rounded-[28px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
        onSubmit={handleCreateContinue}
      >
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
                  setSubmittedEmail(null);
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
                setSubmittedEmail(null);
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
            {isCreatePasswordStep ? (
              <p className="text-xs font-normal text-slate-500">Use at least 8 characters.</p>
            ) : null}
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
        {currentAccountRecovery ? (
          <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-sm text-sky-800">{currentAccountRecovery.hint}</p>
            <Link
              className="inline-flex text-sm font-semibold text-sky-800 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-950"
              href={`/reset-password?email=${encodeURIComponent(currentAccountRecovery.email)}`}
            >
              Reset password
            </Link>
          </div>
        ) : null}
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
            aria-busy={isSubmitting}
            type="submit"
            variant="secondary"
          >
            {isSubmitting
              ? isCreateAccount
                ? "Creating your account…"
                : "Signing you in…"
              : isCreateAccount
                ? isCreatePasswordStep
                  ? "Start 7-day trial"
                  : "Continue"
                : "Sign in"}
          </Button>
        </div>

        {isSubmitting ? (
          <p aria-live="polite" className="text-center text-xs text-slate-500">
            Just a moment — we’re opening your CertScore.ai workspace.
          </p>
        ) : null}

        {allowCreateAccount && isCreateAccount ? (
          <p className="text-xs leading-5 text-slate-500">
            New accounts include a 7-day trial before choosing a monthly plan.
          </p>
        ) : null}
      </form>

      {currentActionError && !currentAccountRecovery ? <p className="text-sm text-red-600">{currentActionError}</p> : null}
      {!isCreateAccount && currentActionError === "Invalid email or password." ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm text-sky-800">Having trouble signing in?</p>
          <Link
            className="mt-1 inline-flex text-sm font-semibold text-sky-800 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-950"
            href={email.trim().length > 0 ? `/reset-password?email=${encodeURIComponent(email.trim())}` : "/reset-password"}
          >
            Use password reset
          </Link>
        </div>
      ) : null}

      {allowCreateAccount && input?.footerMode !== "hidden" ? (
        <div className="-mx-6 -mb-6 rounded-b-[24px] border-t border-slate-200/80 bg-[linear-gradient(180deg,#fbfdff_0%,#f7f9fc_100%)] px-6 py-3 text-center">
          <p className="text-[11px] leading-4 text-slate-500">
            {mode === "create_account" ? "Already have an account? " : "Need an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "create_account" ? "sign_in" : "create_account")}
              className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-950 hover:decoration-slate-500"
            >
              {mode === "create_account" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      ) : null}
    </div>
  );
}
