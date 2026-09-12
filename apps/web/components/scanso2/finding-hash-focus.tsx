"use client";

import { useEffect } from "react";

function getFindingIdFromHash(hash: string) {
  const normalized = decodeURIComponent(hash.replace(/^#/, ""));
  if (
    normalized === "tracker-footprint" ||
    normalized === "vendor-mix" ||
    normalized === "policy-surfaces" ||
    normalized === "fingerprinting" ||
    normalized.startsWith("coverage-section-")
  ) {
    return normalized;
  }
  if (normalized.startsWith("review-lens-")) {
    return normalized;
  }
  if (normalized.startsWith("finding-evidence-")) {
    return normalized.slice("finding-evidence-".length);
  }
  if (normalized.startsWith("review-finding-")) {
    return normalized.slice("review-finding-".length);
  }
  if (normalized.startsWith("finding-")) {
    return normalized.slice("finding-".length);
  }
  return null;
}

function findFindingTarget(findingId: string) {
  if (
    findingId.startsWith("review-lens-") ||
    findingId.startsWith("coverage-section-") ||
    findingId === "tracker-footprint" ||
    findingId === "vendor-mix" ||
    findingId === "policy-surfaces" ||
    findingId === "fingerprinting"
  ) {
    return document.getElementById(findingId);
  }

  return (
    document.getElementById(`finding-evidence-${findingId}`) ??
    document.getElementById(`review-finding-${findingId}`) ??
    document.getElementById(`finding-${findingId}`)
  );
}

function openDetails(element: Element | null) {
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLDetailsElement) {
      current.open = true;
    }
    current = current.parentElement;
  }
}

function openEvidenceJson(target: Element) {
  const nestedDetails = Array.from(target.querySelectorAll("details"));
  if (
    target.id.startsWith("review-lens-") ||
    target.id.startsWith("coverage-section-") ||
    target.id === "tracker-footprint" ||
    target.id === "vendor-mix" ||
    target.id === "policy-surfaces" ||
    target.id === "fingerprinting"
  ) {
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    for (const details of nestedDetails) {
      details.open = true;
    }
    return target;
  }

  const evidenceDetails = nestedDetails.find((details) => details.classList.contains("group/evidence"));
  const jsonDetails = nestedDetails.find((details) => details.classList.contains("group/json"));

  if (target instanceof HTMLDetailsElement) {
    target.open = true;
  }
  if (evidenceDetails instanceof HTMLDetailsElement) {
    evidenceDetails.open = true;
  }
  if (jsonDetails instanceof HTMLDetailsElement) {
    jsonDetails.open = true;
  }

  return jsonDetails?.querySelector("pre") ?? target.querySelector("pre") ?? target;
}

function highlightElement(element: Element) {
  const target = element instanceof HTMLElement ? element : null;
  if (!target) {
    return;
  }

  const previousTransition = target.style.transition;
  const previousBoxShadow = target.style.boxShadow;
  const previousOutline = target.style.outline;
  const previousBackgroundImage = target.style.backgroundImage;

  target.style.transition = "box-shadow 180ms ease, outline-color 180ms ease, background-image 180ms ease";
  target.style.outline = "2px solid rgba(14, 165, 233, 0.65)";
  target.style.boxShadow = "0 0 0 5px rgba(186, 230, 253, 0.85), 0 18px 45px -28px rgba(14, 116, 144, 0.95)";
  target.style.backgroundImage = "linear-gradient(90deg, rgba(14, 165, 233, 0.16), rgba(255, 255, 255, 0) 32%)";

  window.setTimeout(() => {
    target.style.transition = previousTransition;
    target.style.boxShadow = previousBoxShadow;
    target.style.outline = previousOutline;
    target.style.backgroundImage = previousBackgroundImage;
  }, 4200);
}

function focusFindingEvidence() {
  const findingId = getFindingIdFromHash(window.location.hash);
  if (!findingId) {
    return;
  }

  const target = findFindingTarget(findingId);
  if (!target) {
    return;
  }

  openDetails(target);
  const jsonTarget = openEvidenceJson(target);
  highlightElement(jsonTarget);
  window.setTimeout(() => jsonTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
}

export function FindingHashFocus() {
  useEffect(() => {
    focusFindingEvidence();
    window.addEventListener("hashchange", focusFindingEvidence);
    return () => window.removeEventListener("hashchange", focusFindingEvidence);
  }, []);

  return null;
}
