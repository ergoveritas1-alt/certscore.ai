"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type AnalyticsConsentChoice,
  getStoredAnalyticsConsent,
  saveAnalyticsConsent
} from "../../lib/analytics/consent";

function AnalyticsConsentPanel(input: {
  onChoose: (choice: AnalyticsConsentChoice) => void;
  onClose?: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const choiceButtonClassName =
    "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:text-slate-950";

  return (
    <section
      aria-label="Cookie and analytics preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_18px_70px_-30px_rgba(15,23,42,0.5)] backdrop-blur md:bottom-5"
    >
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
        <div className="max-w-md space-y-1">
          <p className="text-sm font-semibold text-slate-950">Cookie and analytics preferences</p>
          <p className="text-sm leading-5 text-slate-600">
            <span className="block">Optional analytics help improve CertScore.</span>
            <span className="block">
              Passwords and form entries are excluded.{" "}
              <Link className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-800" href="/privacy#cookies-analytics">
                Learn more
              </Link>
              .
            </span>
          </p>
        </div>
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 md:mt-0 md:justify-end">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((value) => !value)}
          >
            Cookie settings
          </button>
          <button
            type="button"
            className={choiceButtonClassName}
            onClick={() => input.onChoose("denied")}
          >
            Reject analytics
          </button>
          <button
            type="button"
            className={choiceButtonClassName}
            onClick={() => input.onChoose("granted")}
          >
            Allow analytics
          </button>
          {input.onClose ? (
            <button
              type="button"
              aria-label="Close cookie preferences"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              onClick={input.onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </div>
      {showSettings ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
          Optional analytics records limited product activity—such as pages, actions, outcomes, and scan references—only after approval. Essential security and service telemetry is separate and remains active.
        </div>
      ) : null}
    </section>
  );
}

export function AnalyticsConsentBanner() {
  const pathname = usePathname();
  const [storedChoice, setStoredChoice] = useState<AnalyticsConsentChoice | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setStoredChoice(getStoredAnalyticsConsent());
    setIsReady(true);
  }, []);

  if (pathname.startsWith("/calibration/") || !isReady || storedChoice) {
    return null;
  }

  function choose(choice: AnalyticsConsentChoice) {
    saveAnalyticsConsent(choice);
    setStoredChoice(choice);
  }

  return <AnalyticsConsentPanel onChoose={choose} />;
}

export function AnalyticsPreferencesButton() {
  const [isOpen, setIsOpen] = useState(false);

  function choose(choice: AnalyticsConsentChoice) {
    saveAnalyticsConsent(choice);
    setIsOpen(false);
  }

  return (
    <>
      <button type="button" className="hover:text-slate-900" onClick={() => setIsOpen(true)}>
        Cookie preferences
      </button>
      {isOpen ? <AnalyticsConsentPanel onChoose={choose} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
