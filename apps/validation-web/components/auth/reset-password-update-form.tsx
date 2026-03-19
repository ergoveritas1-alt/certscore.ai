"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser";

export function ResetPasswordUpdateForm() {
  const router = useRouter();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    passwordInputRef.current?.focus();

    let isMounted = true;

    async function initializeRecoverySession() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (!isMounted) {
          return;
        }

        if (setSessionError) {
          setError("This reset link is invalid or expired.");
          setHasRecoverySession(false);
          return;
        }

        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        setError(null);
        setHasRecoverySession(true);
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError) {
        setError("This reset link is invalid or expired.");
        setHasRecoverySession(false);
        return;
      }

      setHasRecoverySession(Boolean(data.session));
    }

    void initializeRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.trim().length === 0) {
      setError("Enter a new password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password
    });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?message=password_reset");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">Choose a new password</h1>
        <p className="text-sm text-slate-600">Enter a new password for your CertScore.ai account.</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
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

        {hasRecoverySession === false ? <p className="text-sm text-red-600">This reset link is invalid or expired.</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button
          className="w-full"
          disabled={isSubmitting || hasRecoverySession !== true || password.length === 0}
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
