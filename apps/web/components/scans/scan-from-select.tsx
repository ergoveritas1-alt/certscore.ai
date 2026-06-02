"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SCAN_FROM_OPTIONS = [
  {
    description: "Run from CertScore's default cloud scanner.",
    icon: "cloud",
    label: "Cloud",
    value: "default"
  },
  {
    description: "Run from this browser using the CertScore Chrome extension.",
    icon: "local",
    label: "Local-extension",
    value: "local_extension"
  },
  {
    description: "Run from CertScore's European Union scan context.",
    flag: "🇪🇺",
    label: "EU",
    value: "eu"
  },
  {
    description: "Run from CertScore's United Kingdom scan context.",
    flag: "🇬🇧",
    label: "UK",
    value: "uk"
  },
  {
    description: "Run from CertScore's California scan context.",
    flag: "california",
    label: "California",
    value: "california"
  }
] as const;

export type ScanFrom = (typeof SCAN_FROM_OPTIONS)[number]["value"];
export type ServerScanFrom = Exclude<ScanFrom, "local_extension">;

type ScanFromSelectProps = {
  compact?: boolean;
  freshRescanName?: string;
  freshRescanValue?: boolean;
  id?: string;
  name?: string;
  includeLocalExtension?: boolean;
  includeFreshRescanOption?: boolean;
  onChange?: (value: ScanFrom) => void;
  onFreshRescanChange?: (value: boolean) => void;
  variant?: "field" | "icon";
  value?: ScanFrom;
};

type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
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

function CloudIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7.8 18.2h9.1a4.1 4.1 0 0 0 .9-8.1 6 6 0 0 0-11.4-1.9A5 5 0 0 0 7.8 18.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function FlagMarker({ flag, icon, selected }: { flag?: string; icon?: string; selected: boolean }) {
  if (icon === "cloud") {
    return <CloudIcon className={selected ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-slate-500"} />;
  }

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

function SelectedScanFromMarker({ option }: { option: (typeof SCAN_FROM_OPTIONS)[number] }) {
  return (
    <FlagMarker
      flag={"flag" in option ? option.flag : undefined}
      icon={"icon" in option ? option.icon : undefined}
      selected
    />
  );
}

export function ScanFromSelect({
  compact = false,
  freshRescanName = "forceNewScan",
  freshRescanValue,
  id = "scanFrom",
  includeFreshRescanOption = false,
  includeLocalExtension = false,
  name = "scanFrom",
  onChange,
  onFreshRescanChange,
  variant = "field",
  value = "default"
}: ScanFromSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [uncontrolledFreshRescan, setUncontrolledFreshRescan] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = includeLocalExtension ? SCAN_FROM_OPTIONS : SCAN_FROM_OPTIONS.filter((option) => option.value !== "local_extension");
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? SCAN_FROM_OPTIONS[0];
  const freshRescan = freshRescanValue ?? uncontrolledFreshRescan;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateMenuPosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect();

      if (!buttonRect) {
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportPadding = 16;
      const gap = 9;
      const width = variant === "icon" ? Math.min(320, viewportWidth - viewportPadding * 2) : Math.min(288, viewportWidth - viewportPadding * 2);
      const desiredLeft = variant === "icon" ? buttonRect.right - width + 96 : buttonRect.left;
      const left = Math.min(Math.max(viewportPadding, desiredLeft), Math.max(viewportPadding, viewportWidth - width - viewportPadding));
      const measuredHeight = menuRef.current?.offsetHeight;
      const targetHeight = measuredHeight && measuredHeight > 0 ? measuredHeight : includeFreshRescanOption ? 390 : 260;
      const spaceBelow = viewportHeight - buttonRect.bottom - gap - viewportPadding;
      const spaceAbove = buttonRect.top - gap - viewportPadding;
      const opensAbove = spaceBelow < Math.min(targetHeight, 300) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(targetHeight, opensAbove ? spaceAbove : spaceBelow));
      const top = opensAbove ? Math.max(viewportPadding, buttonRect.top - gap - maxHeight) : Math.min(buttonRect.bottom + gap, viewportHeight - viewportPadding - maxHeight);

      setMenuPosition({
        left,
        maxHeight,
        top,
        width
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [includeFreshRescanOption, isOpen, variant]);

  function selectScanFrom(nextValue: ScanFrom) {
    onChange?.(nextValue);
    setIsOpen(false);
  }

  function setFreshRescan(nextValue: boolean) {
    if (freshRescanValue === undefined) {
      setUncontrolledFreshRescan(nextValue);
    }
    onFreshRescanChange?.(nextValue);
  }

  const menuOptions = options;

  const buttonClassName =
    variant === "icon"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-transparent text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      : compact
        ? "inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        : "inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200";

  return (
    <div ref={wrapperRef} className={variant === "icon" ? "relative" : compact ? "relative inline-flex items-center gap-2 text-xs font-medium text-slate-600" : "relative block space-y-1.5"}>
      <input id={id} name={name} type="hidden" value={value} />
      {includeFreshRescanOption && freshRescan ? <input name={freshRescanName} type="hidden" value="true" /> : null}
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
        ref={buttonRef}
        title={`Scan from: ${selectedOption.label}`}
        type="button"
      >
        <SelectedScanFromMarker option={selectedOption} />
        {variant === "field" ? <span>{selectedOption.label}</span> : null}
        {variant === "field" ? (
          <svg aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 20 20">
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        ) : null}
      </button>
      {isOpen && isMounted
        ? createPortal(
            <div
              className="fixed z-[1000] isolate overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.16)]"
              ref={menuRef}
              style={{
                left: menuPosition?.left ?? 16,
                maxHeight: menuPosition?.maxHeight ?? 320,
                top: menuPosition?.top ?? 16,
                width: menuPosition?.width ?? (variant === "icon" ? 320 : 288)
              }}
            >
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
                      title={option.description}
                      type="button"
                    >
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
                        <FlagMarker
                          flag={"flag" in option ? option.flag : undefined}
                          icon={"icon" in option ? option.icon : undefined}
                          selected={isSelected}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={isSelected ? "block text-sm font-semibold text-slate-950" : "block text-sm font-semibold text-slate-700"}>{option.label}</span>
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
              {includeFreshRescanOption ? (
                <div className="mt-1 border-t border-slate-200/70 pt-1">
                  <div className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Options</div>
                  <label
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition hover:bg-slate-50"
                    title="Bypass the 24-hour recent-scan reuse check."
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-700">Fresh re-scan</span>
                    </span>
                    <input
                      checked={freshRescan}
                      className="sr-only"
                      onChange={(event) => setFreshRescan(event.target.checked)}
                      type="checkbox"
                    />
                    <span
                      className={
                        freshRescan
                          ? "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-sky-500 transition"
                          : "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-200 transition"
                      }
                    >
                      <span
                        className={
                          freshRescan
                            ? "h-4 w-4 translate-x-4 rounded-full bg-white shadow-sm transition"
                            : "h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition"
                        }
                      />
                    </span>
                  </label>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
