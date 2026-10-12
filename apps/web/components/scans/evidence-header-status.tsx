import React from "react";
import { EvidenceStatusBadge } from "./evidence-status-badge";

type Row = { status: string; priority?: "high" };
/** Summarize existing row statuses only; never promote missing evidence to a concern. */
export function evidenceHeaderStatus(rows: readonly Row[]) {
  if (rows.some(row => row.status === "Gap observed")) return { label: "Issues found", description: "Observed gap in this section", concern: true };
  if (rows.some(row => row.status === "Potential gap")) return { label: "Review recommended", description: "Potential gap in this section", concern: true };
  if (rows.some(row => ["Partial concern", "Review signal", "Needs review", "Warning"].includes(row.status))) return { label: "Review", description: "Issue needs review", concern: false };
  if (rows.some(row => ["Not confirmed", "Limited", "Insufficient evidence", "Not testable"].includes(row.status))) return { label: "Limited", description: "Evidence coverage is limited; not a confirmed issue", concern: false };
  if (rows.some(row => row.priority === "high" && row.status === "Observed")) return { label: "Review recommended", description: "Observed finding to review in this section", concern: true };
  return null;
}
export function EvidenceHeaderStatus({ rows }: { rows: readonly Row[] }) {
  const status = evidenceHeaderStatus(rows);
  if (!status) return null;
  return <EvidenceStatusBadge label={status.label} description={status.description} tone={status.label === "Limited" ? "limited" : "review"} />;
}
