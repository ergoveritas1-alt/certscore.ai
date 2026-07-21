"use client";

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

  return (
    <section
      aria-label="Cookie and analytics preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_70px_-30px_rgba(15,23,42,0.5)] backdrop-blur md:bottom-5"
    >
      <div className="md:flex md:items-center md:justify-between md:gap-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-950">Cookie and analytics preferences</p>
          <p className="text-sm leading-6 text-slate-600">
            We use privacy-bounded Umami for anonymous pageviews and coarse product events by default. Optional Google analytics loads only after you allow it. You can reject optional analytics now and change this choice later from Cookie preferences.
          </p>
        </div>
        <div className="mt-3 flex shrink-0 flex-wrap gap-2 md:mt-0">
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((value) => !value)}
          >
            Cookie settings
          </button>
          {input.onClose ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
              onClick={input.onClose}
            >
              Close
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            onClick={() => input.onChoose("denied")}
          >
            Reject analytics
          </button>
          <button
            type="button"
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={() => input.onChoose("granted")}
          >
            Allow analytics
          </button>
        </div>
      </div>
      {showSettings ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          Optional analytics cookies and session-insight tools help CertScore.ai understand product usage and improve reliability. They stay off unless you choose Allow analytics. Necessary app, security, and account cookies may still run.
        </div>
      ) : null}
    </section>
  );
}

export function AnalyticsConsentBanner() {
  const [storedChoice, setStoredChoice] = useState<AnalyticsConsentChoice | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setStoredChoice(getStoredAnalyticsConsent());
    setIsReady(true);
  }, []);

  if (!isReady || storedChoice) {
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
        Cookie / analytics preferences
      </button>
      {isOpen ? <AnalyticsConsentPanel onChoose={choose} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
