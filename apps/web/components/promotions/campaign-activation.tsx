"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export function CampaignActivation({ signedIn, hasInvite }: { signedIn: boolean; hasInvite: boolean }) {
  const [ready, setReady] = useState(hasInvite);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [end, setEnd] = useState("");
  const pendingToken = useRef("");
  const verifying = useRef(false);

  const verifyInvitation = useCallback(async () => {
    if (verifying.current || !pendingToken.current) return;
    verifying.current = true;
    setReady(false);
    setBusy(true);
    setError("");
    setRetryAvailable(false);
    try {
      const response = await fetch("/api/promotions/black-friday/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingToken.current })
      });
      if (!response.ok) {
        setRetryAvailable(response.status >= 500 || response.status === 429);
        setError(response.status === 403
          ? "This invitation is invalid or expired. Check the latest invitation in your approval email."
          : "We couldn’t verify your invitation right now. Please try again.");
        return;
      }
      // The response has established the HttpOnly invitation cookie. Retain the
      // fragment until this point so refreshes and transient failures can retry.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      pendingToken.current = "";
      setReady(true);
    } catch {
      setError("We couldn’t verify your invitation. Check your connection and try again.");
      setRetryAvailable(true);
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    pendingToken.current = window.location.hash.slice(1);
    if (pendingToken.current) void verifyInvitation();
  }, [verifyInvitation]);

  async function activate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/promotions/black-friday/activate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEnd(data.end);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (end) {
    return (
      <div role="status">
        <h2 className="text-2xl font-semibold">Your Pro access is active.</h2>
        <p className="mt-4">Complimentary access ends {new Date(end).toLocaleString()}. No automatic paid renewal.</p>
        <Link href="/app" className="mt-6 inline-block text-indigo-700 underline">Open your CertScore.ai workspace →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p>Use the personal invitation from your approval email. Sign in or create an account with the same business email, then activate three months of Pro. No credit card is needed.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {busy && <p role="status">Checking your invitation…</p>}
      {retryAvailable && <button className="rounded-xl border border-slate-300 px-6 py-3 disabled:opacity-50" disabled={busy} onClick={() => void verifyInvitation()}>Retry invitation verification</button>}
      {ready && !signedIn && (
        <div className="flex flex-wrap gap-5">
          <Link className="rounded-xl bg-indigo-600 px-6 py-3 text-white" href="/login?next=%2Fblack-friday%2Factivate">Sign in</Link>
          <Link className="rounded-xl border border-slate-300 px-6 py-3" href="/login?mode=create_account&next=%2Fblack-friday%2Factivate">Create an account</Link>
        </div>
      )}
      {ready && signedIn && <button className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={activate}>Activate my three months of Pro</button>}
      {!ready && !busy && !error && <p>Open the activation link in your approval email to continue.</p>}
      <p className="text-sm text-slate-500">Your activation deadline is 14 days after approval. Existing paid subscriptions cannot be replaced by this offer.</p>
    </div>
  );
}
