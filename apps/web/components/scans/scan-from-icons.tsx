import React from "react";

export type ScanFromIconName = "cloud" | "local";
export type ScanFromFlag = string;

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

function CaliforniaFlagIcon({ className = "h-4 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} data-scan-from-flag="california" viewBox="0 0 30 20">
      <rect fill="#fffdf5" height="20" rx="1.8" width="30" />
      <rect fill="#c12b2f" height="3" width="30" y="17" />
      <path d="M5.2 4.2 5.9 5.5l1.45.2-1.05 1.02.25 1.44-1.3-.68-1.3.68.25-1.44-1.05-1.02 1.45-.2.6-1.3Z" fill="#c12b2f" />
      <path d="M9.2 11.5c0-2.25 1.65-3.5 4.35-3.5h4.75c2.2 0 3.6 1.02 3.95 2.72l1.4.28c.72.15 1.1.55 1.1 1.2 0 .48-.35.85-.82.85H9.55c-.23 0-.35-.1-.35-.3v-1.25Z" fill="#7b5136" />
      <path d="M12.1 13.05v1.25M18.95 13.05v1.25M21.15 9.42l1.95-1.08" stroke="#3f2e22" strokeLinecap="round" strokeWidth="1" />
      <circle cx="13.1" cy="9.85" fill="#f3ede0" r="0.55" />
      <path d="M8.5 15h15.8" stroke="#2d7d46" strokeLinecap="round" strokeWidth="1.1" />
    </svg>
  );
}

export function ScanFromMarker({ flag, icon, selected }: { flag?: ScanFromFlag; icon?: ScanFromIconName; selected: boolean }) {
  if (icon === "cloud") {
    return <CloudIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

  if (icon === "local") {
    return <LocalExtensionIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

  if (flag === "california") {
    return <CaliforniaFlagIcon className="h-4 w-6 drop-shadow-[0_0_0.5px_rgba(15,23,42,0.35)]" />;
  }

  if (flag) {
    return <span className="text-base leading-none">{flag}</span>;
  }

  return <GlobeIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-400"} />;
}
