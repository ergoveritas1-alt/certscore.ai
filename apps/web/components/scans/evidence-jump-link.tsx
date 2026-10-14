"use client";

import React, { type ReactNode } from "react";

export function EvidenceJumpLink({ targetId, children, className }: {
  targetId: string;
  children: ReactNode;
  className?: string;
}) {
  return <a href={`#${targetId}`} className={`report-evidence-link ${className ?? ""}`} onClick={event => {
    const anchor = document.getElementById(targetId) ?? document.getElementById("evidence");
    const target = (anchor?.dataset.sharedEvidenceTarget ? document.getElementById(anchor.dataset.sharedEvidenceTarget) : null) ?? anchor;
    if (!target) return;
    event.preventDefault();
    for (let element: HTMLElement | null = target; element; element = element.parentElement) {
      if (element.tagName === "DETAILS") element.setAttribute("open", "");
    }
    document.querySelectorAll("[data-evidence-target]").forEach(element => element.removeAttribute("data-evidence-target"));
    target.setAttribute("data-evidence-target", "");
    if (target.id) window.history.replaceState(window.history.state, "", `#${encodeURIComponent(target.id)}`);
    const focus = target.querySelector<HTMLElement>("summary") ?? target;
    // Some evidence cards use a section anchor around their disclosure.
    focus.closest("details")?.setAttribute("open", "");
    focus.setAttribute("tabindex", "-1");
    window.requestAnimationFrame(() => {
      focus.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }}>{children}</a>;
}
