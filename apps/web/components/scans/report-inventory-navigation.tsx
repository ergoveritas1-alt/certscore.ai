"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { ReportEvidencePhase } from "./report-page-event-timeline";

export type InventoryResourceKind = "all" | "request" | "cookie" | "embed";
type InventoryView = "services" | "resources";
const InventoryNavigation = createContext<{
  view: InventoryView;
  setView: (view: InventoryView) => void;
  kind: InventoryResourceKind;
  setKind: (kind: InventoryResourceKind) => void;
  phase: ReportEvidencePhase;
  setPhase: (phase: ReportEvidencePhase) => void;
  navigate: (view: InventoryView, kind?: InventoryResourceKind, phase?: ReportEvidencePhase) => void;
} | null>(null);

/** Shared UI state for the overview links and the inventory table below it. */
export function ReportInventoryNavigation({ children }: { children: ReactNode }) {
  const [view, setView] = useState<InventoryView>("services");
  const [kind, setKind] = useState<InventoryResourceKind>("all");
  const [phase, setPhase] = useState<ReportEvidencePhase>("pre-consent");
  const navigate = (next: InventoryView, nextKind: InventoryResourceKind = "all", nextPhase?: ReportEvidencePhase) => {
    if (nextPhase) setPhase(nextPhase);
    setKind(nextKind);
    setView(next);
    const navigateToInventory = () => {
      const target = document.getElementById("report-resource-inventory");
      if (nextPhase && target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    if (nextPhase) window.requestAnimationFrame(navigateToInventory);
    else navigateToInventory();
  };
  return <InventoryNavigation.Provider value={{view, setView, kind, setKind, phase, setPhase, navigate}}>{children}</InventoryNavigation.Provider>;
}
export const useReportInventoryNavigation = () => useContext(InventoryNavigation);
