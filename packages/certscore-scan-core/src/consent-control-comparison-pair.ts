import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { classifyConsentControlLabel, normalizeConsentControlText } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact, ConsentControlCandidateEvidence } from "./consent-control-geometry.js";

/** Pure selection over retained observations. Does not establish inventory completeness,
 * screenshot binding, action authorization, or a prominence finding. */
export function comparisonPair(geometry: ConsentControlGeometryArtifact) {
  const eligible = geometry.candidates.filter(c => c.layer === "first_layer" && c.decisionStatus === "confirmed_visible" &&
    c.enabled && c.frameContext.frameKind === "main_frame" && c.frameContext.frameUrl === geometry.pageUrl &&
    !c.actionableControlCandidateId);
  const pairs = eligible.filter(c => c.actionType === "accept_all").flatMap(accept =>
    eligible.filter(c => c.actionType === "reject_all").flatMap(reject => {
      const a = accept.boundingBox, r = reject.boundingBox;
      // One clearly paired action row or column; never compare a banner control with an
      // unrelated page CTA or choose the most asymmetric of several pairs.
      const overlap = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      const gap = Math.max(a.left, r.left) - Math.min(a.right, r.right);
      const sharedSurface = geometry.containers.some(c => c.layer === "first_layer" &&
        [a, r].every(box => box.left >= c.boundingBox.left && box.right <= c.boundingBox.right &&
          box.top >= c.boundingBox.top && box.bottom <= c.boundingBox.bottom));
      const horizontalOverlap = Math.min(a.right, r.right) - Math.max(a.left, r.left);
      const verticalGap = Math.max(a.top, r.top) - Math.min(a.bottom, r.bottom);
      const sameRow = overlap >= Math.min(a.height, r.height) * 0.8 && gap >= 0 && gap <= 600;
      const alignedCenters = Math.abs((a.left + a.right) / 2 - (r.left + r.right) / 2) <= Math.max(16, Math.min(a.width, r.width) * 0.2);
      const sameColumn = alignedCenters && horizontalOverlap >= Math.min(a.width, r.width) * 0.8 && verticalGap >= 0 && verticalGap <= 240;
      return sharedSurface && (sameRow || sameColumn)
        ? [{ accept, reject }] : [];
    }));
  if (pairs.length) return pairs.length === 1 ? pairs[0] : undefined;

  // Separated refusal links need semantic and surface proof instead of proximity.
  // Never pick the smallest Reject or an arbitrary pair from several decisions.
  const accepts = eligible.filter(c => c.actionType === "accept_all");
  const rejects = eligible.filter(c => c.actionType === "reject_all");
  if (accepts.length !== 1 || rejects.length !== 1) return undefined;
  const accept = accepts[0]!, reject = rejects[0]!;
  const control = (c: ConsentControlCandidateEvidence) => c.consentContextConfirmed === true &&
    c.intersectsViewport && !c.clippedByScrollableAncestor &&
    (c.tagName !== "a" || c.linkDestination === "same_document") &&
    (c.tagName === "button" || c.role === "button" || c.tagName === "a");
  if (!control(accept) || !control(reject)) return undefined;
  const refusal = classifyConsentControlLabel({ label: reject.label, ariaLabel: reject.ariaLabel,
    title: reject.title, value: reject.value, hasConsentContext: true, usage: "observation",
    linkRole: reject.role, linkDestination: reject.linkDestination });
  if (refusal.intent !== "reject" || !["direct", "equivalent"].includes(refusal.matchStrength ?? "") ||
      refusal.variant && refusal.variant !== "necessary_only") return undefined;
  // A bare/partial reject verb can refer to an individual service. Require a
  // complete multiword canonical label or the named CMP's canonical global target.
  // Ignore only decorative symbols (e.g. the arrow after Qobuz's visible label).
  const words = (s: string) => normalizeConsentControlText(s).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const term = words(refusal.matchedTerm ?? "");
  const completeLabel = term.split(" ").length >= 2 && words(reject.label) === term;
  const definition = KNOWN_CMP_REGISTRY.find(c => c.canonicalName === geometry.cmp.name);
  const canonicalTarget = geometry.cmp.detected && definition?.rejectControlSelectors?.includes(reject.selectorHint) === true;
  if (!completeLabel && !canonicalTarget) return undefined;
  const contains = (outer: ConsentControlCandidateEvidence["boundingBox"], inner: ConsentControlCandidateEvidence["boundingBox"]) =>
    inner.width > 0 && inner.height > 0 && inner.left >= outer.left && inner.right <= outer.right &&
    inner.top >= outer.top && inner.bottom <= outer.bottom;
  const parents = [accept, reject].map(c => geometry.containers.find(p => p.containerId === c.containerId &&
    p.layer === "first_layer" && p.intersectsViewport && contains(p.boundingBox, c.boundingBox)));
  if (parents.some(p => !p)) return undefined;
  const a = accept.boundingBox, r = reject.boundingBox;
  if (Math.min(a.right, r.right) > Math.max(a.left, r.left) &&
      Math.min(a.bottom, r.bottom) > Math.max(a.top, r.top)) return undefined;
  const sharedSurface = geometry.containers.some(c => c.layer === "first_layer" && c.intersectsViewport &&
    c.boundingBox.width * c.boundingBox.height < geometry.viewport.width * geometry.viewport.height * 0.95 &&
    parents.every(p => contains(c.boundingBox, p!.boundingBox)));
  return sharedSurface ? { accept, reject } : undefined;
}

