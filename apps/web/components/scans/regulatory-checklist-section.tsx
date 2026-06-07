"use client";

import React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { RegulatoryChecklistAdvancedEvidenceProvider } from "./regulatory-checklist-advanced-evidence-context";

type RegulatoryChecklistTab = {
  content: ReactNode;
  group?: "visible" | "united_states" | "europe_uk" | "international";
  id: string;
  label: string;
  shortLabel?: string;
};

type RegulatoryChecklistSectionProps = {
  showAdvancedEvidenceToggle?: boolean;
  tabs: RegulatoryChecklistTab[];
};

export function RegulatoryChecklistSection({ showAdvancedEvidenceToggle = false, tabs }: RegulatoryChecklistSectionProps) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? "");
  const [expandAllAdvancedEvidence, setExpandAllAdvancedEvidence] = useState(false);
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

  if (!activeTab) {
    return null;
  }

  return (
    <section className="space-y-0">
      <div className="relative overflow-hidden rounded-t-3xl border border-b-0 border-slate-200 bg-white px-4 py-4 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Regulatory Review</p>
              <span className="inline-flex shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                Beta
              </span>
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 pb-1 lg:justify-end lg:pb-0">
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1 shadow-inner shadow-slate-200/60">
              {showAdvancedEvidenceToggle ? (
                <button
                  type="button"
                  aria-pressed={expandAllAdvancedEvidence}
                  className={cn(
                    "rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition",
                    expandAllAdvancedEvidence
                      ? "border-sky-700 bg-sky-600 text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.9)] ring-1 ring-sky-700"
                      : "border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:border-sky-300 hover:bg-white hover:text-sky-900"
                  )}
                  onClick={() => setExpandAllAdvancedEvidence((value) => !value)}
                >
                  {expandAllAdvancedEvidence ? "Collapse all" : "Expand all"}
                </button>
              ) : null}
              {visibleTabs.map((tab) => {
          const selected = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                selected
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_12px_24px_-14px_rgba(15,23,42,0.9)] ring-1 ring-slate-950"
                  : "border-transparent text-slate-500 hover:bg-white hover:text-slate-900"
              )}
              onClick={() => setActiveTabId(tab.id)}
            >
                    {tab.shortLabel ?? tab.label}
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
                    {activeInMenu ? `More: ${activeTab.shortLabel ?? activeTab.label}` : "More"}
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
                                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition",
                                  selected ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                                )}
                                onClick={(event) => {
                                  setActiveTabId(tab.id);
                                  event.currentTarget.closest("details")?.removeAttribute("open");
                                }}
                              >
                                <span>{tab.label}</span>
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
        </div>
      </div>
      <div className="-mt-px [&>*]:rounded-t-none">
        <RegulatoryChecklistAdvancedEvidenceProvider value={{ expandAllAdvancedEvidence }}>
          {activeTab.content}
        </RegulatoryChecklistAdvancedEvidenceProvider>
      </div>
    </section>
  );
}
