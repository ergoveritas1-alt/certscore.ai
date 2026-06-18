"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LOCAL_V2_SCAN_PROFILE_OPTIONS,
  normalizeLocalV2ScanProfile,
  type LocalV2ScanProfile
} from "./scan-submit-progress";
import { ScanFromMarker } from "./scan-from-icons";

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
  }
] as const;

export type ScanFrom = (typeof SCAN_FROM_OPTIONS)[number]["value"];
export type ServerScanFrom = Exclude<ScanFrom, "local_extension">;

type ScanFromSelectProps = {
  compact?: boolean;
  freshRescanName?: string;
  freshRescanValue?: boolean;
  id?: string;
  includeLocalV2ScanProfileOption?: boolean;
  name?: string;
  includeLocalExtension?: boolean;
  includeFreshRescanOption?: boolean;
  localV2ScanProfileName?: string;
  localV2ScanProfileValue?: LocalV2ScanProfile;
  localV2RunViaLambdaName?: string;
  localV2RunViaLambdaValue?: boolean;
  includeScanFromOptions?: boolean;
  onChange?: (value: ScanFrom) => void;
  onFreshRescanChange?: (value: boolean) => void;
  onLocalV2ScanProfileChange?: (value: LocalV2ScanProfile) => void;
  onLocalV2RunViaLambdaChange?: (value: boolean) => void;
  variant?: "field" | "icon";
  value?: ScanFrom;
};

type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

function SelectedScanFromMarker({ option }: { option: (typeof SCAN_FROM_OPTIONS)[number] }) {
  return (
    <ScanFromMarker
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
  includeLocalV2ScanProfileOption = false,
  includeFreshRescanOption = false,
  includeLocalExtension = false,
  includeScanFromOptions = true,
  localV2ScanProfileName = "localV2ScanProfile",
  localV2ScanProfileValue,
  localV2RunViaLambdaName = "localV2RunViaLambda",
  localV2RunViaLambdaValue,
  name = "scanFrom",
  onChange,
  onFreshRescanChange,
  onLocalV2ScanProfileChange,
  onLocalV2RunViaLambdaChange,
  variant = "field",
  value = "default"
}: ScanFromSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [uncontrolledFreshRescan, setUncontrolledFreshRescan] = useState(true);
  const [uncontrolledLocalV2ScanProfile, setUncontrolledLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [uncontrolledLocalV2RunViaLambda, setUncontrolledLocalV2RunViaLambda] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = includeLocalExtension ? SCAN_FROM_OPTIONS : SCAN_FROM_OPTIONS.filter((option) => option.value !== "local_extension");
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? SCAN_FROM_OPTIONS[0];
  const freshRescan = freshRescanValue ?? uncontrolledFreshRescan;
  const localV2ScanProfile = localV2ScanProfileValue ?? uncontrolledLocalV2ScanProfile;
  const localV2RunViaLambda = localV2RunViaLambdaValue ?? uncontrolledLocalV2RunViaLambda;

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

      const promptRect = variant === "icon" ? wrapperRef.current?.parentElement?.parentElement?.getBoundingClientRect() : null;
      const anchorTop = promptRect?.top ?? buttonRect.top;
      const anchorBottom = promptRect?.bottom ?? buttonRect.bottom;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportPadding = 16;
      const gap = 0;
      const width = variant === "icon" ? Math.min(320, viewportWidth - viewportPadding * 2) : Math.min(288, viewportWidth - viewportPadding * 2);
      const desiredLeft = variant === "icon" ? buttonRect.right - width + 96 : buttonRect.left;
      const left = Math.min(Math.max(viewportPadding, desiredLeft), Math.max(viewportPadding, viewportWidth - width - viewportPadding));
      const measuredHeight = menuRef.current?.offsetHeight;
      const targetHeight = measuredHeight && measuredHeight > 0
        ? measuredHeight
        : includeFreshRescanOption
          ? 440
          : includeLocalV2ScanProfileOption && !includeScanFromOptions
            ? 190
            : 260;
      const spaceBelow = viewportHeight - anchorBottom - gap - viewportPadding;
      const spaceAbove = anchorTop - gap - viewportPadding;
      const opensAbove = spaceBelow < Math.min(targetHeight, 300) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(targetHeight, opensAbove ? spaceAbove : spaceBelow));
      const top = opensAbove ? Math.max(viewportPadding, anchorTop - gap - maxHeight) : Math.min(anchorBottom + gap, viewportHeight - viewportPadding - maxHeight);

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
  }, [includeFreshRescanOption, includeLocalV2ScanProfileOption, includeScanFromOptions, isOpen, variant]);

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

  function setLocalV2ScanProfile(nextValue: LocalV2ScanProfile) {
    if (localV2ScanProfileValue === undefined) {
      setUncontrolledLocalV2ScanProfile(nextValue);
    }
    onLocalV2ScanProfileChange?.(nextValue);
  }

  function setLocalV2RunViaLambda(nextValue: boolean) {
    if (localV2RunViaLambdaValue === undefined) {
      setUncontrolledLocalV2RunViaLambda(nextValue);
    }
    onLocalV2RunViaLambdaChange?.(nextValue);
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
      {includeLocalV2ScanProfileOption ? (
        <input name={localV2ScanProfileName} type="hidden" value={normalizeLocalV2ScanProfile(localV2ScanProfile)} />
      ) : null}
      {includeLocalV2ScanProfileOption && localV2RunViaLambda ? (
        <input name={localV2RunViaLambdaName} type="hidden" value="true" />
      ) : null}
      {includeFreshRescanOption && freshRescan ? <input name={freshRescanName} type="hidden" value="true" /> : null}
      {variant === "field" ? (
        <span className={compact ? "shrink-0" : "block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"}>
          {includeScanFromOptions ? "Scan from" : "Scan options"}
        </span>
      ) : null}
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={includeScanFromOptions ? `Scan from: ${selectedOption.label}` : "Scan options"}
        className={buttonClassName}
        onClick={() => setIsOpen((current) => !current)}
        ref={buttonRef}
        title={includeScanFromOptions ? `Scan from: ${selectedOption.label}` : "Scan options"}
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
              {includeFreshRescanOption || includeLocalV2ScanProfileOption ? (
                <div className="pb-1">
                  <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Options</div>
                  {includeLocalV2ScanProfileOption ? (
                    <>
                      <div className="px-3 pb-2">
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                          {LOCAL_V2_SCAN_PROFILE_OPTIONS.map((option) => {
                            const isSelected = option.value === localV2ScanProfile;
                            return (
                              <button
                                aria-pressed={isSelected}
                                className={
                                  isSelected
                                    ? "rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm"
                                    : "rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
                                }
                                key={option.value}
                                onClick={() => setLocalV2ScanProfile(option.value)}
                                title={option.description}
                                type="button"
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <label
                        className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition hover:bg-slate-50"
                        title="Dispatch this v2 DAG scan through the configured AWS Lambda path."
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-700">Run via Lambda</span>
                        </span>
                        <input
                          checked={localV2RunViaLambda}
                          className="sr-only"
                          onChange={(event) => setLocalV2RunViaLambda(event.target.checked)}
                          type="checkbox"
                        />
                        <span
                          className={
                            localV2RunViaLambda
                              ? "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-sky-500 transition"
                              : "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-200 transition"
                          }
                        >
                          <span
                            className={
                              localV2RunViaLambda
                                ? "h-4 w-4 translate-x-4 rounded-full bg-white shadow-sm transition"
                                : "h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition"
                            }
                          />
                        </span>
                      </label>
                    </>
                  ) : null}
                  {includeFreshRescanOption ? (
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
                  ) : null}
                </div>
              ) : null}
              {includeScanFromOptions ? (
                <div className={includeFreshRescanOption || includeLocalV2ScanProfileOption ? "border-t border-slate-200/70 pt-1" : ""}>
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
                            <ScanFromMarker
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
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
