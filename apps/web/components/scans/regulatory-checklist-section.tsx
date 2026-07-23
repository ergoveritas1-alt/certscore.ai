"use client";

import React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { ApplicabilityAssumptionsNote } from "./privacy-law-applicability-context";
import { RegulatoryChecklistAdvancedEvidenceProvider } from "./regulatory-checklist-advanced-evidence-context";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

type RegulatoryChecklistTab = {
  badgeLabel?: string;
  content: ReactNode;
  group?: "visible" | "united_states" | "europe_uk" | "international";
  id: string;
  label: string;
  shortLabel?: string;
};

type RegulatoryChecklistSectionProps = {
  headingLabel?: string;
  headingTrailing?: ReactNode;
  showAdvancedEvidenceToggle?: boolean;
  tabs: RegulatoryChecklistTab[];
};

function TabLabel({ tab, useShortLabel = false }: { tab: RegulatoryChecklistTab; useShortLabel?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{useShortLabel ? tab.shortLabel ?? tab.label : tab.label}</span>
      {tab.badgeLabel ? (
        <span className="inline-flex shrink-0 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-700">
          {tab.badgeLabel}
        </span>
      ) : null}
    </span>
  );
}

export function RegulatoryChecklistSection({ headingLabel = "Regulatory Diagnostics", headingTrailing, showAdvancedEvidenceToggle = false, tabs }: RegulatoryChecklistSectionProps) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? "");
  const [isSectionExpanded, setIsSectionExpanded] = useState(true);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
  const visibleTabs = tabs.filter((tab) => !tab.group || tab.group === "visible");
  const menuGroups = [
    {
      id: "united_states",
      label: "United States",
      tabs: tabs.filter((tab) => tab.group === "united_states")
    },
    {
      id: "europe_uk",
      label: "Europe / UK",
      tabs: tabs.filter((tab) => tab.group === "europe_uk")
    },
    {
      id: "international",
      label: "International",
      tabs: tabs.filter((tab) => tab.group === "international")
    }
  ].filter((group) => group.tabs.length > 0);
  const activeInMenu = activeTab ? menuGroups.some((group) => group.tabs.some((tab) => tab.id === activeTab.id)) : false;
  const hasMultipleTabChoices = visibleTabs.length + menuGroups.reduce((sum, group) => sum + group.tabs.length, 0) > 1;

  if (!activeTab) {
    return null;
  }

  return (
    <section className="space-y-0">
      <div className="relative overflow-visible rounded-t-3xl border border-b-0 border-slate-200 bg-white px-4 py-4 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {showAdvancedEvidenceToggle ? (
                <button
                  type="button"
                  aria-label={isSectionExpanded ? `Collapse ${headingLabel}` : `Expand ${headingLabel}`}
                  aria-pressed={isSectionExpanded}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                  title={isSectionExpanded ? `Collapse ${headingLabel}` : `Expand ${headingLabel}`}
                  onClick={() => setIsSectionExpanded((value) => !value)}
                >
                  <ScanReportDisclosureIcon open={isSectionExpanded} className="h-8 w-8 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5" />
                </button>
              ) : null}
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">{headingLabel}</p>
              <ApplicabilityAssumptionsNote />
            </div>
          </div>
          {headingTrailing ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1.5 lg:justify-end">
              {headingTrailing}
            </div>
          ) : null}
          {hasMultipleTabChoices ? (
          <div className="flex max-w-full flex-wrap items-center gap-2 pb-1 lg:justify-end lg:pb-0">
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1 shadow-inner shadow-slate-200/60">
              {visibleTabs.map((tab) => {
                const selected = tab.id === activeTab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "scan-report-button rounded-full px-3 py-1.5 text-xs font-semibold",
                      selected
                        ? "scan-report-button-dark border-slate-950 bg-slate-950 text-white shadow-[0_12px_24px_-14px_rgba(15,23,42,0.9)] ring-1 ring-slate-950"
                        : "border-transparent text-slate-500 hover:bg-white hover:text-slate-900"
                    )}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <TabLabel tab={tab} useShortLabel />
                  </button>
                );
              })}
              {menuGroups.length > 0 ? (
                <details className="group relative">
                  <summary
                    className={cn(
                      "list-none rounded-full px-3 py-1.5 text-xs font-semibold transition marker:hidden [&::-webkit-details-marker]:hidden",
                      activeInMenu
                        ? "bg-slate-950 text-white shadow-[0_12px_24px_-14px_rgba(15,23,42,0.9)] ring-1 ring-slate-950"
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    {activeInMenu ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span>More:</span>
                        <TabLabel tab={activeTab} useShortLabel />
                      </span>
                    ) : "More"}
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.65)]">
                    {menuGroups.map((group) => (
                      <div key={group.id} className="py-1">
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {group.label}
                        </p>
                        <div className="space-y-1">
                          {group.tabs.map((tab) => {
                            const selected = tab.id === activeTab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                className={cn(
                                  "scan-report-button flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold",
                                  selected ? "scan-report-button-dark bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                                )}
                                onClick={(event) => {
                                  setActiveTabId(tab.id);
                                  event.currentTarget.closest("details")?.removeAttribute("open");
                                }}
                              >
                                <TabLabel tab={tab} />
                                {selected ? <span aria-hidden>✓</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>
          ) : null}
        </div>
      </div>
      <div className="[&>*]:border-t-0 [&>*]:rounded-t-none">
        {isSectionExpanded ? (
          <RegulatoryChecklistAdvancedEvidenceProvider value={{ expandAllAdvancedEvidence: false }}>
            {activeTab.content}
          </RegulatoryChecklistAdvancedEvidenceProvider>
        ) : null}
      </div>
    </section>
  );
}
