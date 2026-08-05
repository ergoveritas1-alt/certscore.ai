"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getChunkLoadRecoveryKey,
  isChunkLoadError
} from "../lib/errors/chunk-load-recovery";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const staleBundle = isChunkLoadError(error);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!staleBundle) {
      return;
    }

    const recoveryKey = getChunkLoadRecoveryKey(error, window.location.pathname);
    try {
      if (window.sessionStorage.getItem(recoveryKey)) {
        return;
      }
      window.sessionStorage.setItem(recoveryKey, "1");
    } catch {
      // If storage is unavailable, keep the manual hard-refresh action below
      // instead of risking an automatic reload loop.
      return;
    }

    setRefreshing(true);
    window.location.reload();
  }, [error, staleBundle]);

  const retry = () => {
    if (staleBundle) {
      setRefreshing(true);
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="min-h-screen bg-slate-50">
          <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">500</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Something went wrong</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              The page could not be rendered. Try again or return to the homepage.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                disabled={refreshing}
                onClick={retry}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {refreshing ? "Refreshing…" : staleBundle ? "Refresh page" : "Try again"}
              </button>
              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
              >
                Go home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
