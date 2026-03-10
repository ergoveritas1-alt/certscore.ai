"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { startTransition, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser";

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

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const initialMessage = searchParams.get("message");
  const [status, setStatus] = useState<string | null>(initialMessage === "signed_out" ? null : initialMessage);
  const [errorMessage, setErrorMessage] = useState<string | null>(searchParams.get("error"));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = getSafeRedirectPath(searchParams.get("next"));
  const supabase = createBrowserSupabaseClient();
  const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const introCopy = googleEnabled
    ? "Continue with Google or request a magic link. Access is scoped to one workspace per user for the MVP."
    : "Request a magic link to sign in. Access is scoped to one workspace per user for the MVP.";

  async function handleGoogleSignIn() {
    setErrorMessage(null);
    setStatus(null);
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo
      }
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatus(null);
    setIsSubmitting(true);

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo
      }
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setStatus("Magic link sent. Check your inbox to finish signing in.");
    setIsSubmitting(false);
  }

  return (
    <div className="space-y-4">
      {googleEnabled ? (
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
          <span>Sign in with Google</span>
        </Button>
      ) : null}

      <p className="text-sm text-slate-600">{introCopy}</p>

      <form className="space-y-3" onSubmit={(event) => void handleMagicLink(event)}>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Email address
          <Input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
        </label>
        <Button className="w-full" disabled={isSubmitting || email.length === 0} type="submit" variant="secondary">
          Send magic link
        </Button>
      </form>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
