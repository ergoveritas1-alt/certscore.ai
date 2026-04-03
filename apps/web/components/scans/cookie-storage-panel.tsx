type CookieStoragePanelProps = {
  adtechCookieNames: string[];
  analyticsCookieNames: string[];
  cookieNamesBeforeConsent: string[];
  cookiesBeforeConsentCount: number;
  cookiesSeenCount: number;
  localStorageKeys: string[];
  securityCookieNames: string[];
  sessionStorageKeys: string[];
  storageWrittenBeforeConsent: boolean;
  thirdPartyCookieNames: string[];
  thirdPartyCookieNamesBeforeConsent: string[];
  thirdPartyCookiesSeenCount: number;
  thirdPartyCookieBeforeConsentCount: number;
};

export function CookieStoragePanel(input: CookieStoragePanelProps) {
  return (
    <div className="space-y-5 rounded-[1.55rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)]">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Cookies & storage</p>
        <p className="text-sm text-slate-600">Persistence evidence captured during the live browser run.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cookies seen</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{input.cookiesSeenCount}</p>
        </div>
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Third-party cookies</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{input.thirdPartyCookiesSeenCount}</p>
        </div>
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Before consent</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{input.cookiesBeforeConsentCount}</p>
        </div>
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Third-party before consent</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{input.thirdPartyCookieBeforeConsentCount}</p>
        </div>
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Storage before consent</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{input.storageWrittenBeforeConsent ? "Yes" : "No"}</p>
        </div>
      </div>
      {input.analyticsCookieNames.length > 0 || input.adtechCookieNames.length > 0 || input.securityCookieNames.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Analytics cookies</p>
            <p className="mt-2 text-sm text-slate-950">{input.analyticsCookieNames.slice(0, 4).join(", ") || "None"}</p>
          </div>
          <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Adtech cookies</p>
            <p className="mt-2 text-sm text-amber-950">{input.adtechCookieNames.slice(0, 4).join(", ") || "None"}</p>
          </div>
          <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">Security / anti-bot</p>
            <p className="mt-2 text-sm text-sky-950">{input.securityCookieNames.slice(0, 4).join(", ") || "None"}</p>
          </div>
        </div>
      ) : null}
      {input.thirdPartyCookieNames.length > 0 || input.cookieNamesBeforeConsent.length > 0 || input.thirdPartyCookieNamesBeforeConsent.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Third-party cookie names</p>
            <p className="mt-2 text-sm text-slate-950">{input.thirdPartyCookieNames.slice(0, 16).join(", ") || "None"}</p>
          </div>
          <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Cookie names before consent</p>
            <p className="mt-2 text-sm text-rose-950">{input.cookieNamesBeforeConsent.slice(0, 16).join(", ") || "None"}</p>
          </div>
          <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50/70 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Third-party cookie names before consent</p>
            <p className="mt-2 text-sm text-amber-950">{input.thirdPartyCookieNamesBeforeConsent.slice(0, 16).join(", ") || "None"}</p>
          </div>
        </div>
      ) : null}
      {input.localStorageKeys.length > 0 || input.sessionStorageKeys.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3.5 text-sm text-slate-700">
          {input.localStorageKeys.length > 0 ? <p>Local storage keys: {input.localStorageKeys.slice(0, 5).join(", ")}</p> : null}
          {input.sessionStorageKeys.length > 0 ? <p>Session storage keys: {input.sessionStorageKeys.slice(0, 5).join(", ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
