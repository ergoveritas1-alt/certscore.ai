"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@website-signal-risk-scanner/ui";

type RegulatoryChecklistTab = {
  content: ReactNode;
  id: string;
  label: string;
};

type RegulatoryChecklistSectionProps = {
  tabs: RegulatoryChecklistTab[];
};

export function RegulatoryChecklistSection({ tabs }: RegulatoryChecklistSectionProps) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  if (!activeTab) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)]">
        {tabs.map((tab) => {
          const selected = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                selected
                  ? "bg-white text-slate-950 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.55)]"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
              )}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab.content}
    </section>
  );
}
