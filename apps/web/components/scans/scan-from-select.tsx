"use client";

import { useEffect, useRef, useState } from "react";

export const SCAN_FROM_OPTIONS = [
  { description: "Standard CertScore scan", label: "Default", value: "default" },
  { flag: "🇪🇺", label: "EU", value: "eu" },
  { flag: "🇬🇧", label: "UK", value: "uk" },
  { flag: "california", label: "California", value: "california" },
  { description: "Run from this browser with the CertScore extension", icon: "local", label: "Local-extension", value: "local_extension" }
] as const;

export type ScanFrom = (typeof SCAN_FROM_OPTIONS)[number]["value"];
export type ServerScanFrom = Exclude<ScanFrom, "local_extension">;

type ScanFromSelectProps = {
  compact?: boolean;
  id?: string;
  name?: string;
  includeLocalExtension?: boolean;
  onChange?: (value: ScanFrom) => void;
  variant?: "field" | "icon";
  value?: ScanFrom;
};

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 12h16M12 3.75c2.1 2.2 3.15 4.95 3.15 8.25S14.1 18.05 12 20.25C9.9 18.05 8.85 15.3 8.85 12S9.9 5.95 12 3.75Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CaliforniaFlagIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-5 rounded-[2px] ring-1 ring-slate-200" viewBox="0 0 28 18">
      <rect fill="#fff" height="18" width="28" />
      <rect fill="#c91f2f" height="3" width="28" y="15" />
      <path d="m5 3.2.45 1.05 1.15.1-.88.72.27 1.13L5 5.6l-.99.6.27-1.13-.88-.72 1.15-.1L5 3.2Z" fill="#c91f2f" />
      <path d="M8.1 10.1c.3-1.9 1.85-3.1 4.25-3.1h3.9c2.15 0 3.55 1.05 3.55 2.45 0 1.55-1.45 2.55-3.7 2.55h-6.15c-1.05 0-1.95-.82-1.85-1.9Z" fill="#7d5a3a" />
      <path d="M9.4 12h8.4" stroke="#2f5f2f" strokeLinecap="round" strokeWidth="1" />
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

function FlagMarker({ flag, icon, selected }: { flag?: string; icon?: string; selected: boolean }) {
  if (icon === "local") {
    return <LocalExtensionIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

  if (flag === "california") {
    return <CaliforniaFlagIcon />;
  }

  if (flag) {
    return <span className="text-base leading-none">{flag}</span>;
  }

  return <GlobeIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-400"} />;
}

export function ScanFromSelect({
  compact = false,
  id = "scanFrom",
  includeLocalExtension = false,
  name = "scanFrom",
  onChange,
  variant = "field",
  value = "default"
}: ScanFromSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = includeLocalExtension ? SCAN_FROM_OPTIONS : SCAN_FROM_OPTIONS.filter((option) => option.value !== "local_extension");
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? SCAN_FROM_OPTIONS[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function selectScanFrom(nextValue: ScanFrom) {
    onChange?.(nextValue);
    setIsOpen(false);
  }

  const menuOptions = variant === "icon" ? options.filter((option) => option.value !== "default") : options;

  const buttonClassName =
    variant === "icon"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-transparent text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      : compact
        ? "inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        : "inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200";

  return (
    <div ref={wrapperRef} className={variant === "icon" ? "relative" : compact ? "relative inline-flex items-center gap-2 text-xs font-medium text-slate-600" : "relative block space-y-1.5"}>
      <input id={id} name={name} type="hidden" value={value} />
      {variant === "field" ? (
        <span className={compact ? "shrink-0" : "block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"}>
          Scan from
        </span>
      ) : null}
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Scan from: ${selectedOption.label}`}
        className={buttonClassName}
        onClick={() => setIsOpen((current) => !current)}
        title={`Scan from: ${selectedOption.label}`}
        type="button"
      >
        {"icon" in selectedOption && selectedOption.icon === "local" ? (
          <LocalExtensionIcon className={variant === "icon" ? "h-5 w-5" : "h-4 w-4"} />
        ) : (
          <GlobeIcon className={variant === "icon" ? "h-5 w-5" : "h-4 w-4"} />
        )}
        {variant === "field" ? <span>{selectedOption.label}</span> : null}
        {variant === "field" ? (
          <svg aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 20 20">
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        ) : null}
      </button>
      {isOpen ? (
        <div className={variant === "icon" ? "absolute left-1/2 top-[calc(100%+0.55rem)] z-30 w-max min-w-[9.25rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.16)]" : "absolute left-0 top-[calc(100%+0.55rem)] z-30 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.16)]"}>
          <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Scan from</div>
          <div role="listbox" aria-label="Scan from">
            {menuOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  aria-selected={isSelected}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  key={option.value}
                  onClick={() => selectScanFrom(option.value)}
                  role="option"
                  type="button"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
                    <FlagMarker
                      flag={"flag" in option ? option.flag : undefined}
                      icon={"icon" in option ? option.icon : undefined}
                      selected={isSelected}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className={isSelected ? "block text-sm font-semibold text-slate-950" : "block text-sm font-semibold text-slate-700"}>{option.label}</span>
                    {"description" in option ? <span className="block text-xs text-slate-500">{option.description}</span> : null}
                  </span>
                  {isSelected ? (
                    <svg aria-hidden="true" className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 20 20">
                      <path d="m4.5 10.5 3.25 3.25 7.75-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
