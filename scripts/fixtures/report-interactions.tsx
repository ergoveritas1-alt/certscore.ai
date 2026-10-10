import React from "react";
import { CollectionSurfacesTable, type CollectionSurfaceTableRow } from "../../apps/web/components/scans/collection-surfaces-table";
import { ReportPageEventTimeline } from "../../apps/web/components/scans/report-page-event-timeline";
import { ViewerTimestamp } from "../../apps/web/components/time/viewer-timestamp";

// Synthetic component inputs only; no scan record, retained evidence or report route.
const rows: CollectionSurfaceTableRow[] = ["Contact", "Newsletter"].map((title, index) => ({
  id: `fixture-${index}`, capturedAt: "2026-10-08T00:22:22Z", capturePhase: "after_accept_click",
  snapshot: { status: "available", url: `/api/scans/fixture/form-${index}.png` },
  form: {
    formRef: `fixture-${index}`, title, structure: "native_form", surfaceType: "generic_form",
    pageUrl: "https://example.test/", method: "post", actionRelationship: "same_site",
    candidateFieldCount: 1, retainedFieldCount: 1, fieldsTruncated: false,
    confidence: 1, directVsInferred: "direct", evidenceRefs: [],
    fields: [{ fieldRef: `email-${index}`, elementType: "input", inputType: "email", semanticCategory: "email",
      label: "Business email", required: true, disabled: false, readOnly: false,
      confidence: 1, directVsInferred: "direct", evidenceRefs: [] }],
    ...(index === 0 ? { privacyDisclosure: { version: 1 as const, truncated: false, excerpts: [{
      text: "We use your email to answer your request.", association: "inside_form" as const, links: [],
    }] } } : {}),
  },
}));

export function ReportInteractionFixture() {
  return <>
    <ViewerTimestamp value="2026-10-08T00:22:22Z" includeSeconds />
    <ReportPageEventTimeline
      events={[{ at: "10.13s", atMs: 10130, label: "Cookie/storage", detail: "Observed storage", tone: "neutral" }]}
      accept={{ coverage: "limited", clockLabel: "Times from Accept click", events: [
        { at: "0s", atMs: 0, label: "Accept clicked", detail: "Click completed", tone: "neutral" },
        { at: "0.4s", atMs: 400, label: "Accepted activity", detail: "Comparison baseline", tone: "neutral" },
      ] }}
      reject={{ coverage: "complete", clockLabel: "Times from confirmed Reject", events: [
        { at: "0s", atMs: 0, label: "Reject confirmed", detail: "Decision confirmed", tone: "positive" },
        { at: "0.16s", atMs: 160, label: "Non-essential request", detail: "Fixture issue", tone: "concern" },
      ] }} />
    <CollectionSurfacesTable rows={rows} />
  </>;
}
