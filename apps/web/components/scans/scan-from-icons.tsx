import React from "react";

export type ScanFromIconName = "california" | "cloud" | "local";
export type ScanFromFlag = string;

function CaliforniaIcon({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        selected
          ? "inline-flex h-4 min-w-5 items-center justify-center rounded border border-sky-300 bg-sky-50 px-0.5 text-[0.55rem] font-bold leading-none tracking-[-0.03em] text-sky-700"
          : "inline-flex h-4 min-w-5 items-center justify-center rounded border border-slate-300 bg-slate-50 px-0.5 text-[0.55rem] font-bold leading-none tracking-[-0.03em] text-slate-600"
      }
    >
      CA
    </span>
  );
}

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 12h16M12 3.75c2.1 2.2 3.15 4.95 3.15 8.25S14.1 18.05 12 20.25C9.9 18.05 8.85 15.3 8.85 12S9.9 5.95 12 3.75Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function LocalExtensionIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M5.5 8.5h13a2 2 0 0 1 2 2v5.75a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V10.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8.5V7.25A4 4 0 0 1 12 3.25a4 4 0 0 1 4 4V8.5M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M12 16.25v-2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloudIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7.8 18.2h9.1a4.1 4.1 0 0 0 .9-8.1 6 6 0 0 0-11.4-1.9A5 5 0 0 0 7.8 18.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function ScanFromMarker({ flag, icon, selected }: { flag?: ScanFromFlag; icon?: ScanFromIconName; selected: boolean }) {
  if (icon === "california") {
    return <CaliforniaIcon selected={selected} />;
  }

  if (icon === "cloud") {
    return <CloudIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

  if (icon === "local") {
    return <LocalExtensionIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

  if (flag) {
    return <span className="text-base leading-none">{flag}</span>;
  }

  return <GlobeIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-400"} />;
}
