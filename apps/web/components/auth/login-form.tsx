"use client";

import Link from "next/link";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser";
import { submitCredentialsAction } from "../../server/password-auth/actions";
import {
  initialCredentialsActionState,
  type CredentialsActionState
} from "../../server/password-auth/action-state";

type AuthMode = CredentialsActionState["mode"];

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 18 18">
      <path
        fill="#EA4335"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.86 2.68-6.62Z"
      />
      <path
        fill="#4285F4"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#34A853"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.33l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33c.71-2.12 2.69-3.7 5.03-3.7Z"
      />
    </svg>
  );
}

function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

function clearBrowserSupabaseAuthState() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("sb-") && key.includes("auth-token")) {
      window.localStorage.removeItem(key);
    }
  }

  for (const cookie of document.cookie.split(";")) {
    const [rawName] = cookie.split("=");
    const name = rawName?.trim();
    if (name && name.startsWith("sb-") && name.includes("auth-token")) {
      document.cookie = `${name}=; expires=${new Date(0).toUTCString()}; path=/`;
    }
  }
}

function getAuthCallbackUrl(nextPath: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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
  const nextPath = getSafeRedirectPath(searchParams.get("next"));
  const googleEnabled = (input?.allowGoogle ?? true) && process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const allowCreateAccount = input?.allowCreateAccount ?? true;
  const initialMessage = searchParams.get("message");
  const initialError = searchParams.get("error");
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientEmailError, setClientEmailError] = useState<string | null>(null);
  const [createAccountHint, setCreateAccountHint] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    initialMessage === "email_verified"
      ? "Email verified."
      : initialMessage === "password_reset"
        ? "Password updated. Sign in with your new password."
        : null
  );
  const [googleError, setGoogleError] = useState<string | null>(
    initialError === "invalid_verification_link"
      ? "That verification link is invalid or expired."
      : initialError === "bad_oauth_state"
        ? "Google sign-in expired or became stale. Try again."
        : initialError === "auth_service_unavailable"
          ? "Authentication is temporarily unavailable from this local runtime. If you're on localhost, use a supported Node LTS version and confirm DNS access to Supabase."
        : initialError
  );
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [actionState, formAction, isPending] = useActionState(submitCredentialsAction, initialCredentialsActionState);
  const supabase = createBrowserSupabaseClient();
  const fieldErrors = actionState.mode === mode ? actionState.fieldErrors : {};
  const actionError = actionState.mode === mode ? actionState.error : null;
  const accountRecovery = actionState.mode === mode ? actionState.accountRecovery : null;

  useEffect(() => {
    clearBrowserSupabaseAuthState();
  }, []);

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
    setCreateAccountHint(null);
    setGoogleError(null);
    setStatus(null);
    setPassword("");
    setShowPassword(false);

    if (nextMode === "create_account") {
      setCreateStep(1);
    }
  }

  function startCreatePasswordRecovery(recoveryEmail: string) {
    setMode("create_account");
    setEmail(recoveryEmail);
    setPassword("");
    setShowPassword(false);
    setClientEmailError(null);
    setGoogleError(null);
    setStatus(null);
    setCreateAccountHint("Create a password for this existing account to sign in with email or Google.");
    setCreateStep(2);
  }

  async function handleGoogleSignIn() {
    setGoogleError(null);
    setStatus(null);
    setIsGoogleSubmitting(true);

    clearBrowserSupabaseAuthState();

    const redirectTo = getAuthCallbackUrl(nextPath);
    const { error } = await supabase.auth.signInWithOAuth({
      options: {
        redirectTo
      },
      provider: "google"
    });

    if (error) {
      setGoogleError(error.message);
      setIsGoogleSubmitting(false);
    }
  }

  async function handleCreateContinue(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== "create_account" || createStep !== 1) {
      return;
    }

    event.preventDefault();
    setStatus(null);
    setGoogleError(null);

    if (!isValidEmail(email)) {
      setClientEmailError("Enter a valid email address.");
      return;
    }

    setClientEmailError(null);
    setCreateAccountHint(null);

    try {
      const response = await fetch(`/api/auth/account-status?email=${encodeURIComponent(email.trim())}`);

      if (response.ok) {
        const data = (await response.json()) as {
          authProvider: string | null;
          hasPassword: boolean;
        };

        if (!data.hasPassword && typeof data.authProvider === "string" && data.authProvider.includes("google")) {
          setCreateAccountHint("This email already uses Google. Creating a password will let you sign in either way.");
        }
      }
    } catch {
      // Ignore lookup failures and continue with the normal create-account flow.
    }

    setCreateStep(2);
  }

  const isCreateAccount = mode === "create_account";
  const isCreatePasswordStep = isCreateAccount && createStep === 2;
  const isSubmitting = isPending || isGoogleSubmitting;

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

      {googleEnabled && !isCreateAccount ? (
        <div className="space-y-[17px] pt-[25px]">
          <Button
            className="w-full justify-center gap-3 rounded-md border border-[#b9b5ff] bg-white text-[13px] font-medium text-[#4f46e5] shadow-none hover:bg-[#f8f7ff]"
            disabled={isSubmitting}
            onClick={() => {
              startTransition(() => {
                void handleGoogleSignIn();
              });
            }}
            type="button"
            variant="secondary"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
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
                setCreateAccountHint(null);
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
            {!isCreateAccount && allowCreateAccount ? (
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
        {createAccountHint ? <p className="text-sm text-sky-700">{createAccountHint}</p> : null}
        {fieldErrors.email ? <p className="text-sm text-red-600">{fieldErrors.email}</p> : null}
        {fieldErrors.password ? <p className="text-sm text-red-600">{fieldErrors.password}</p> : null}
        {allowCreateAccount && accountRecovery?.kind === "create_password" ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p>{accountRecovery.hint}</p>
            <button
              type="button"
              onClick={() => startCreatePasswordRecovery(accountRecovery.email)}
              className="mt-2 text-sm font-medium text-sky-700 transition hover:text-sky-800"
            >
              Create password
            </button>
          </div>
        ) : null}

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
          {isCreateAccount ? (isCreatePasswordStep ? "Create account" : "Continue") : "Sign in"}
        </Button>

        {allowCreateAccount && isCreateAccount ? <p className="text-xs text-slate-500">No credit card required.</p> : null}
      </form>

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
      {googleError ? <p className="text-sm text-red-600">{googleError}</p> : null}
    </div>
  );
}
