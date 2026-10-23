"use client";

import React, { useEffect, type ReactNode } from "react";
import { REPORT_EVIDENCE_LINK_TARGETS, REPORT_SECTION_LINK_TARGETS } from "@certscore/api-contracts";

export function reportEvidenceIdFromHash(hash: string) {
  let id: string;
  try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return null; }
  return REPORT_EVIDENCE_LINK_TARGETS.some(target => target.anchor === id)
    || (REPORT_SECTION_LINK_TARGETS as readonly string[]).includes(id) ? id : null;
}

export function focusReportEvidence(targetId: string, fallback = false) {
  const anchor = document.getElementById(targetId) ?? (fallback ? document.getElementById("evidence") : null);
  const target = (anchor?.dataset.sharedEvidenceTarget ? document.getElementById(anchor.dataset.sharedEvidenceTarget) : null) ?? anchor;
  if (!target) return false;
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    if (element.tagName === "DETAILS") element.setAttribute("open", "");
  }
  document.querySelectorAll("[data-evidence-target]").forEach(element => element.removeAttribute("data-evidence-target"));
  target.setAttribute("data-evidence-target", "");
  // Incoming shared aliases remain stable on reload and when the report URL is copied.
  if (fallback && target.id) window.history.replaceState(window.history.state, "", `#${encodeURIComponent(target.id)}`);
  const focus = target.querySelector<HTMLElement>("summary") ?? target;
  focus.closest("details")?.setAttribute("open", "");
  focus.setAttribute("tabindex", "-1");
  window.requestAnimationFrame(() => {
    focus.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: !fallback || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  return true;
}

/** Open collapsed evidence for incoming agent links as well as in-report clicks. */
export function ReportEvidenceHashNavigation() {
  useEffect(() => {
    const navigate = () => {
      const id = reportEvidenceIdFromHash(window.location.hash);
      if (id) focusReportEvidence(id);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  return null;
}

export function EvidenceJumpLink({ targetId, children, className }: {
  targetId: string;
  children: ReactNode;
  className?: string;
}) {
  return <a href={`#${targetId}`} className={`report-evidence-link ${className ?? ""}`} onClick={event => {
    if (focusReportEvidence(targetId, true)) event.preventDefault();
  }}>{children}</a>;
}
