import React from "react";
import { EvidenceStatusBadge } from "./evidence-status-badge";

import { evidenceHeaderStatus, type EvidenceSummaryRow } from "../../lib/scans/detailed-evidence-presentation";
export { evidenceHeaderStatus, evidenceSectionRecap } from "../../lib/scans/detailed-evidence-presentation";

export function EvidenceHeaderStatus({ rows }: { rows: readonly EvidenceSummaryRow[] }) {
  const status = evidenceHeaderStatus(rows);
  if (!status) return null;
  return <EvidenceStatusBadge label={status.label} description={status.description} tone={status.label === "Review" ? "review" : "limited"} />;
}
