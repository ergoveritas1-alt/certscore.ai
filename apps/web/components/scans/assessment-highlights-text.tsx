import React, { Fragment, type ReactNode } from "react";
import type { AssessmentHighlightLink } from "../../lib/scans/assessment-highlights";
import { EvidenceJumpLink } from "./evidence-jump-link";

/** Render links supplied by the shared highlight projection; do not infer findings. */
export function AssessmentHighlightsText({ text, links = [] }: { text: string; links?: readonly AssessmentHighlightLink[] }) {
  const parts: ReactNode[] = [];
  let position = 0;
  while (position < text.length) {
    const next = links.map(link => ({ ...link, index: text.indexOf(link.label, position) }))
      .filter(link => link.label && link.index >= 0).sort((a, b) => a.index - b.index)[0];
    if (!next) { parts.push(text.slice(position)); break; }
    parts.push(text.slice(position, next.index));
    parts.push(<EvidenceJumpLink key={next.index} targetId={next.targetId} className="text-inherit underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-sky-700 hover:decoration-sky-400 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">{next.label}</EvidenceJumpLink>);
    position = next.index + next.label.length;
  }
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}
