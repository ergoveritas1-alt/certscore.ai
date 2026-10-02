import React from "react";
import { EvidenceStatusBadge } from "./evidence-status-badge";

type Row = { status: string; priority?: "high" };
/** Summarize existing row statuses only; never promote missing evidence to a concern. */
export function evidenceHeaderStatus(rows: readonly Row[]) {
  if (rows.some(row => row.priority === "high")) return { label: "High priority", description: "High priority issue inside", concern: true };
  if (rows.some(row => ["Potential gap", "Gap observed"].includes(row.status))) return { label: "Flagged", description: "Flagged issue inside", concern: true };
  if (rows.some(row => ["Partial concern", "Review signal", "Needs review", "Warning"].includes(row.status))) return { label: "Review", description: "Issue needs review", concern: false };
  if (rows.some(row => ["Not confirmed", "Limited", "Insufficient evidence", "Not testable"].includes(row.status))) return { label: "Limited", description: "Evidence coverage is limited; not a confirmed issue", concern: false };
  return null;
}
export function EvidenceHeaderStatus({ rows }: { rows: readonly Row[] }) {
  const status = evidenceHeaderStatus(rows);
  if (!status) return null;
  return <EvidenceStatusBadge label={status.label} description={status.description} tone={status.concern ? "concern" : status.label === "Limited" ? "limited" : "review"} />;
}
