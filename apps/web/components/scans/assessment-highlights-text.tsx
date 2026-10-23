"use client";

import React, { Fragment, useId, useState, type ReactNode } from "react";
import type { AssessmentHighlightCopy, AssessmentHighlightLink } from "../../lib/scans/assessment-highlights";
import { EvidenceJumpLink } from "./evidence-jump-link";

/** Render links supplied by the shared highlight projection; do not infer findings. */
function LinkedHighlights({ text, links = [] }: { text: string; links?: readonly AssessmentHighlightLink[] }) {
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

/** Reset disclosure when the report or review focus changes. */
export function AssessmentHighlightsText(props: { text: string; links?: readonly AssessmentHighlightLink[]; expanded?: AssessmentHighlightCopy }) {
  return <HighlightsDisclosure key={`${props.text}:${props.expanded?.text ?? ""}`} {...props} />;
}

function HighlightsDisclosure({ text, links, expanded }: { text: string; links?: readonly AssessmentHighlightLink[]; expanded?: AssessmentHighlightCopy }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = open && expanded ? expanded : { text, links };
  return <><span id={id}><LinkedHighlights {...shown} /></span>{expanded ? <> <button type="button"
    aria-expanded={open} aria-controls={id} aria-label={open ? "Show fewer assessment highlights" : "Show more assessment highlights"}
    className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
    onClick={() => setOpen(value => !value)}>{open ? "Show less" : "…"}</button></> : null}</>;
}
