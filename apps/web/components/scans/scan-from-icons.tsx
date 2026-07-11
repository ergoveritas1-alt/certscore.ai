import React from "react";

export type ScanFromIconName = "cloud" | "local";
export type ScanFromFlag = string;

export function getScanFromMarkerInput(value: string | undefined) {
  switch (value) {
    case "eu_de":
    case "eu":
      return { flag: "🇩🇪" } as const;
    case "eu_ie":
    case "uk":
      return { flag: "🇮🇪" } as const;
    case "california":
      return { flag: "california" } as const;
    case "local_extension":
      return { icon: "local" } as const;
    case "default":
    default:
      return { icon: "cloud" } as const;
  }
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

function CaliforniaFlagIcon({ className = "h-4 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 28 20">
      <rect fill="#fff8ea" height="20" rx="2.5" width="28" />
      <path d="M0 15h28v5H0z" fill="#c9282d" />
      <path d="m5.8 3.1.48 1.15 1.25.1-.95.82.29 1.22-1.07-.65-1.07.65.29-1.22-.95-.82 1.25-.1.48-1.15Z" fill="#188553" />
      <path d="M9.2 10.8h8.7c1.8 0 3.1-1.15 3.1-2.68 0-1.42-1.1-2.43-2.72-2.43h-4.5c-2.7 0-4.58 1.86-4.58 4.2v.91Z" fill="#8b5b3e" />
      <path d="M9.1 11.1h12.2" stroke="#2f2f2f" strokeLinecap="round" strokeWidth="1" />
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
    return <CaliforniaFlagIcon className="h-4 w-5 drop-shadow-[0_1px_1px_rgba(15,23,42,0.18)]" />;
  }

  if (flag) {
    return <span className="text-base leading-none">{flag}</span>;
  }

  return <GlobeIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-400"} />;
}
