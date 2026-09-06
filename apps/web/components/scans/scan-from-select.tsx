"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FullSiteControls, type FullSiteFormValue } from "./full-site-controls";
import { createPortal } from "react-dom";
import type { LocalV2ScanProfile } from "./scan-submit-progress";
import { ScanFromMarker } from "./scan-from-icons";

export const SCAN_FROM_OPTIONS = [
  {
    description: "Run from CertScore.ai's Dublin Lambda scanner.",
    flag: "🇮🇪",
    label: "EU-IR",
    value: "eu_ie"
  },
  {
    description: "Run from CertScore.ai's Frankfurt Lambda scanner.",
    flag: "🇩🇪",
    label: "EU-DE",
    value: "eu_de"
  },
  {
    description: "Run from CertScore.ai's US-West Lambda scanner.",
    flag: "california",
    label: "California",
    value: "california"
  },
  {
    description: "Run from this browser using CertScore.ai Browser Evidence.",
    icon: "local",
    label: "Chrome browser",
    value: "local_extension"
  }
] as const;

export type ScanFrom = (typeof SCAN_FROM_OPTIONS)[number]["value"];
export type ServerScanFrom = Exclude<ScanFrom, "local_extension">;
const DEFAULT_SELECTABLE_SCAN_FROM = "eu_ie" satisfies ServerScanFrom;

type ScanFromSelectProps = {
  includeFullSiteOption?: boolean;
  onFullSiteChange?: (value: FullSiteFormValue) => void;
  allowRestrictedScanOptions?: boolean;
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
  allowRestrictedScanOptions = false,
  includeFullSiteOption = false,
  onFullSiteChange,
  compact = false,
  freshRescanName = "forceNewScan",
  freshRescanValue,
  id = "scanFrom",
  includeLocalV2ScanProfileOption = false,
  includeFreshRescanOption = false,
  includeLocalExtension = false,
  includeScanFromOptions = true,
  localV2ScanProfileName = "localV2ScanProfile",
  localV2RunViaLambdaName = "localV2RunViaLambda",
  localV2RunViaLambdaValue,
  name = "scanFrom",
  onChange,
  onFreshRescanChange,
  onLocalV2RunViaLambdaChange,
  variant = "field",
  value = "eu_ie"
}: ScanFromSelectProps) {
  const pathname = usePathname();
  const [crawl, setCrawl] = useState<FullSiteFormValue>();
  const showCrawl = includeFullSiteOption && (pathname === "/app" || pathname?.startsWith("/app/")) && value !== "local_extension";
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [uncontrolledFreshRescan, setUncontrolledFreshRescan] = useState(false);
  const [uncontrolledLocalV2RunViaLambda, setUncontrolledLocalV2RunViaLambda] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = SCAN_FROM_OPTIONS.filter((option) => {
    if ((!includeLocalExtension || !allowRestrictedScanOptions) && option.value === "local_extension") {
      return false;
    }
    return true;
  });
  const selectedOption =
    options.find((option) => option.value === value) ??
    options.find((option) => option.value === DEFAULT_SELECTABLE_SCAN_FROM) ??
    options[0] ??
    SCAN_FROM_OPTIONS[0];
  const selectedValue = selectedOption.value;
  const freshRescan = freshRescanValue ?? uncontrolledFreshRescan;
  const localV2RunViaLambda = allowRestrictedScanOptions
    ? (localV2RunViaLambdaValue ?? uncontrolledLocalV2RunViaLambda)
    : true;
  const showLocalV2RunViaLambdaOption =
    process.env.NODE_ENV !== "production" && includeLocalV2ScanProfileOption && allowRestrictedScanOptions;
  const hasVisibleMenuContent = includeScanFromOptions || includeFreshRescanOption || showLocalV2RunViaLambdaOption || showCrawl;

  useEffect(() => {
    if (!showCrawl && crawl) {
      setCrawl(undefined);
      onFullSiteChange?.(undefined);
    }
  }, [showCrawl, crawl, onFullSiteChange]);

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
      const measuredHeight = menuRef.current?.scrollHeight;
      const targetHeight = measuredHeight && measuredHeight > 0
        ? measuredHeight
        : includeFreshRescanOption
          ? 440
          : showLocalV2RunViaLambdaOption && !includeScanFromOptions
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
  }, [includeFreshRescanOption, includeScanFromOptions, isOpen, showLocalV2RunViaLambdaOption, variant]);

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

  function setLocalV2RunViaLambda(nextValue: boolean) {
    if (localV2RunViaLambdaValue === undefined) {
      setUncontrolledLocalV2RunViaLambda(nextValue);
    }
    onLocalV2RunViaLambdaChange?.(nextValue);
  }

  const menuOptions = options;

  const buttonClassName =
    variant === "icon"
      ? "scan-report-button inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-slate-700"
      : compact
        ? "scan-report-button inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-slate-700 hover:text-slate-950"
        : "scan-report-button inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:text-slate-950";

  return (
    <div ref={wrapperRef} className={variant === "icon" ? "relative" : compact ? "relative inline-flex items-center gap-2 text-xs font-medium text-slate-600" : "relative block space-y-1.5"}>
      <input id={id} name={name} type="hidden" value={selectedValue} />
      {includeLocalV2ScanProfileOption ? (
        <input name={localV2ScanProfileName} type="hidden" value="standard" />
      ) : null}
      {includeLocalV2ScanProfileOption ? (
        <input name={localV2RunViaLambdaName} type="hidden" value={localV2RunViaLambda ? "true" : "false"} />
      ) : null}
      {includeFreshRescanOption && freshRescan ? <input name={freshRescanName} type="hidden" value="true" /> : null}
      {variant === "field" ? (
        <span className={compact ? "shrink-0" : "block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"}>
          {includeScanFromOptions ? "Scan from" : "Scan options"}
        </span>
      ) : null}
      {hasVisibleMenuContent ? (
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
        </button>
      ) : null}
      {showCrawl && crawl ? <><input type="hidden" name="fullSite" value="true" />{Object.entries(crawl.crawlOptions).map(([key, val]) => <input key={key} type="hidden" name={key} value={String(val)} />)}</> : null}
      {isMounted
        ? createPortal(
            <div
              className="fixed z-[1000] isolate overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.16)]"
              ref={menuRef}
              style={{
                display: isOpen ? undefined : "none",
                left: menuPosition?.left ?? 16,
                maxHeight: menuPosition?.maxHeight ?? 320,
                top: menuPosition?.top ?? 16,
                width: menuPosition?.width ?? (variant === "icon" ? 320 : 288)
              }}
            >
              {includeScanFromOptions ? (
                <div className="pb-1">
                  <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Scan from</div>
                  <div role="listbox" aria-label="Scan from">
                    {menuOptions.map((option) => {
                      const isSelected = option.value === selectedValue;
                      return (
                        <button
                          aria-selected={isSelected}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 hover:text-slate-950"
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
              {includeFreshRescanOption || showLocalV2RunViaLambdaOption || showCrawl ? (
                <div className={includeScanFromOptions ? "border-t border-slate-200/70 pt-1" : "pb-1"}>
                  <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Options</div>
                  {showCrawl ? <FullSiteControls onChange={next => { setCrawl(next); onFullSiteChange?.(next); }} /> : null}
                  {showLocalV2RunViaLambdaOption ? (
                    <label
                      className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition hover:bg-slate-50"
                      title="On uses the selected regional AWS Lambda scanner. Off uses the local Lambda simulator when running on localhost."
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
