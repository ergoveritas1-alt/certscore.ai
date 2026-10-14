import React, { type ReactNode } from "react";
import { DisclosureChevron } from "./report-finding-row";

/** Consistent navigation header; the supplied recap and badge describe existing assessments. */
export function EvidenceSectionHeader({ title, recap, badge }: { title: string; recap: ReactNode; badge?: ReactNode }) {
  return <summary className="evidence-section-header cursor-pointer list-none [&::-webkit-details-marker]:hidden">
    <div className="min-w-0">
      <h3>{title}</h3>
      <div className="evidence-section-recap"><p>{recap}</p>{badge}</div>
    </div>
    <DisclosureChevron className="evidence-section-chevron shrink-0 text-zinc-400" />
  </summary>;
}
