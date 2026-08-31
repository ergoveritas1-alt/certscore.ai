import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { countNonNotObservedRows } from "./evidence-directory-summary";
import { buildRuntimeInventoryCopyPayload } from "./inventory-table-copy";

test("evidence directory summaries exclude only Not observed rows", () => {
  assert.equal(countNonNotObservedRows([
    { status: "Not observed" },
    { status: "Potential gap" },
    { status: "Partial concern" },
    { status: "Not confirmed" },
  ]), 3);
  assert.equal(countNonNotObservedRows([
    { status: "Not observed" },
    { status: "Not observed" },
    { status: "Observed" },
  ]), 1);
});

test("tracking and runtime section headings show non-Not-observed counts over totals", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );

  assert.match(source, /\{trackingExternalFindingCount\} of \{report\.trackingExternalRows\.length\} findings/);
  assert.match(source, /\{preConsentRuntimeFindingCount\} of \{report\.preConsentRuntimeRows\.length\} findings/);
});

test("benchmark labels and values come from canonical non-essential inventory tallies", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );
  const modelSource = await readFile(
    "apps/web/components/scans/report-lab/timeline-report-model.ts",
    "utf8"
  );

  assert.match(source, /label: "Non-essential requests", site: report\.metrics\.nonEssentialRequests/);
  assert.match(source, /label: "Non-essential cookies\/storage", site: report\.metrics\.nonEssentialCookiesStorage/);
  assert.match(modelSource, /buildNonEssentialInventoryTallies\([\s\S]*inventoryProjection\.ungroupedRows/);
  assert.doesNotMatch(modelSource, /third_party_request_count/);
});

test("full runtime inventory shows six rows before becoming vertically scrollable", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );
  const modelSource = await readFile(
    "apps/web/components/scans/report-lab/timeline-report-model.ts",
    "utf8"
  );
  const runtimeSectionSource = await readFile(
    "apps/web/components/scans/runtime-observation-sections.tsx",
    "utf8"
  );

  assert.match(source, /const INVENTORY_VISIBLE_ROW_LIMIT = 6/);
  assert.match(source, /report\.inventory\.length > INVENTORY_VISIBLE_ROW_LIMIT/);
  assert.match(source, /max-h-\[22rem\] overflow-auto/);
  assert.doesNotMatch(source, /max-h-\[48rem\]/);
  assert.match(source, /data-inventory-scroll=/);
  assert.match(source, /detailsLabel="Open full cookie and tracker details"/);
  assert.match(source, /names, purposes, timing, domains, and evidence/);
  assert.match(runtimeSectionSource, /Click to expand/);
  assert.match(runtimeSectionSource, /Hide details/);
  assert.doesNotMatch(source, /Every retained cookie, storage, tracker, and request group from the canonical runtime inventory is available below/);
  assert.match(source, /heading="Every retained cookie and tracker observation"/);
  assert.doesNotMatch(source, /heading="Every retained vendor and request group"/);
  assert.match(source, /label="Copy entire cookies and trackers table"/);
  assert.match(source, /payload=\{copyPayload\}/);
  assert.match(source, /<thead className="sticky top-0/);
  assert.match(source, /min-w-\[95rem\]/);
  assert.match(source, /\["More", "w-\[5\.5rem\]"\], \["Type", "w-\[4rem\]"\], \["Vendor", "w-\[10rem\]"\], \["Name", "w-\[9rem\]"\]/);
  assert.match(source, /<InventoryTypeIcon type=\{row\.type\} \/>[\s\S]*<VendorBrandChip label=\{row\.vendor\}[\s\S]*<InventoryNameDisclosure fullName=\{row\.name\} \/>/);
  assert.match(modelSource, /name: getInventoryObservationNames\(row\)\.join\(", "\) \|\| "Not retained"/);
});

test("inventory copy payload includes every visible column and full retained names", () => {
  const payload = buildRuntimeInventoryCopyPayload([{
    category: "Analytics",
    confidence: "High",
    controllingEntity: "Example LLC",
    domains: "analytics.example.test",
    evidence: "Non-essential",
    entityRelationship: "External entity",
    name: "long_tracker_identifier",
    observed: "2.39s",
    priority: "Medium",
    purpose: "Analytics",
    relationship: "Cross-site",
    requestNames: "/collect",
    serverLocation: "Ireland",
    transferMechanism: "Unknown",
    type: "Tracker / request",
    vendor: "Example Analytics",
    recordCount: 1,
    requestCount: 1,
  }]);

  const [header, row] = payload.split("\n");
  assert.equal(header, "Type\tVendor\tName\tPurpose\tEvidence mix\tFirst seen\tDomains\tRelationship\tConfidence\tPriority");
  assert.match(row ?? "", /Example Analytics\tlong_tracker_identifier\tAnalytics/);
  assert.match(row ?? "", /Cross-site · entity external entity/);
});

test("preview and final reports share the vertically compressed timeline", async () => {
  const source = await readFile(
    "apps/web/components/scans/runtime-observation-sections.tsx",
    "utf8"
  );

  assert.match(source, /data-density="compact"/);
  assert.match(source, /relative pt-6/);
  assert.match(source, /top-\[2\.55rem\]/);
  assert.doesNotMatch(source, /top-\[4\.2rem\]/);
});
