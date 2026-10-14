import React, { type ReactNode, type ComponentProps } from "react";
import { detailedEvidenceCopy } from "./detailed-evidence-copy";
import { EvidenceJumpLink } from "./evidence-jump-link";
import type { SharedEvidenceLink } from "./report-lab/detailed-evidence-layout";
import { DisclosureChevron, EvidenceTools } from "./report-finding-row";

/** Shared presentation of already assessed findings; never assigns a status. */
export function DetailedEvidenceFinding({ id, title, summary, badge, headerActions, children, sharedEvidence, assessmentStatus, ...tools }: {
  id?: string;
  title: ReactNode;
  summary?: ReactNode;
  badge?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  sharedEvidence?: SharedEvidenceLink;
  assessmentStatus?: string;
} & ComponentProps<typeof EvidenceTools>) {
  const copy = typeof title === "string" && (summary === undefined || typeof summary === "string")
    ? detailedEvidenceCopy({ id, status: assessmentStatus, title, summary }) : { title, summary };
  return <details id={id} className="group/evidence-finding scroll-mt-6 py-3">
    <summary className="grid grid-cols-[minmax(0,1fr)_auto] cursor-pointer list-none items-start gap-x-3 gap-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 break-words text-sm font-semibold text-zinc-950">{copy.title}</span>
      <span className="flex shrink-0 items-center justify-self-end gap-2">{headerActions}{badge}<DisclosureChevron className="text-zinc-400 group-open/evidence-finding:rotate-180" /></span>
      {copy.summary ? <span className="col-span-2 min-w-0 text-xs leading-5 text-zinc-600">{copy.summary}</span> : null}
    </summary>
    <div className="mt-4 min-w-0 space-y-4">
      {children}
      {sharedEvidence ? <EvidenceJumpLink targetId={sharedEvidence.targetId} className="inline-block text-xs">{sharedEvidence.label} ↓</EvidenceJumpLink> : <EvidenceTools {...tools} />}
    </div>
  </details>;
}
