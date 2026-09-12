import React from "react";
import { ScanProgressSpinner } from "./scan-progress-spinner";

/** A quiet marker for values that can still change during the scan. */
export function ScanUpdatingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="ml-1.5 inline-flex shrink-0 align-middle text-sky-500" role="img" aria-label="Updating as scan progresses" title="Updating as scan progresses">
      <ScanProgressSpinner />
    </span>
  );
}
