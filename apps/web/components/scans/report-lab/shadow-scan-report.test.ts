import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { countNonNotObservedRows } from "./evidence-directory-summary";
import { buildRuntimeInventoryCopyPayload } from "./inventory-table-copy";
import { buildRuntimeInventoryPurposeCounts } from "../runtime-observation-sections";

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

test("purpose mix merges case-only labels without double-counting retained records", () => {
  const counts = buildRuntimeInventoryPurposeCounts([
    { purpose: "Session replay", recordCount: 2 },
    { purpose: "Session Replay", recordCount: 1 },
    { purpose: "  Analytics  ", recordCount: 4 },
  ]);

  assert.deepEqual(counts, [
    { label: "Analytics", value: 4 },
    { label: "Session replay", value: 3 },
  ]);
  assert.equal(counts.reduce((total, row) => total + row.value, 0), 7);
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
  const gridSource = await readFile(
    "apps/web/components/scans/report-lab/expandable-executive-grid.tsx",
    "utf8"
  );

  assert.match(source, /label: "Non-essential requests",[\s\S]*site: report\.metrics\.nonEssentialRequests/);
  assert.match(source, /label: "Non-essential cookies\/storage",[\s\S]*site: report\.metrics\.nonEssentialCookiesStorage/);
  assert.match(source, /getIndustryBenchmark\(report\.scan\.benchmark\)/);
  assert.doesNotMatch(source, /Compared with/);
  assert.doesNotMatch(source, /evidence-corpus average/);
  assert.match(source, /Industry avg/);
  assert.match(source, /describeIndustryBenchmarkDifference\(row\.site, row\.average\)/);
  assert.doesNotMatch(source, /row\.site \* 5/);
  assert.match(source, /items-baseline gap-x-3 gap-y-0\.5/);
  assert.match(source, /mt-2 grid gap-2\.5 sm:grid-cols-2/);
  assert.match(source, /rounded-md border border-zinc-200 bg-white p-2/);
  assert.match(source, /relative mt-1\.5 h-2 rounded-full/);
  assert.match(source, /data-testid="executive-score-column"/);
  assert.match(source, /data-testid="executive-overview-column"/);
  assert.match(source, /data-testid="executive-industry-benchmark"/);
  assert.match(source, /mt-4 lg:mt-auto lg:pt-6/);
  assert.match(source, /mt-8 lg:mt-auto lg:pt-6/);
  assert.match(source, /data-testid="executive-signal-snapshot"/);
  assert.match(source, /<ExpandableExecutiveGrid>/);
  assert.match(gridSource, /details\[open\]/);
  assert.match(gridSource, /baselineHeightRef/);
  assert.match(gridSource, /overview\.style\.height/);
  assert.match(gridSource, /retainHeightBeforeSignalToggle/);
  assert.match(gridSource, /expandedRef\.current = true/);
  assert.match(gridSource, /addEventListener\("click", retainHeightBeforeSignalToggle, true\)/);
  assert.match(gridSource, /alignItems: expanded \? "start" : "stretch"/);
  assert.match(source, /signalRowClass = "group\/signal border-b border-zinc-200 py-2"/);
  assert.match(source, /signalSummaryClass = "flex cursor-pointer list-none items-center justify-between gap-3 text-xs leading-4/);
  assert.match(source, /data-testid="executive-signal-snapshot">[\s\S]*?<div className="border-t border-zinc-200">[\s\S]*?<details className=\{signalRowClass\}>/);
  assert.match(source, /priorityIssueCountLabel\(report\.findings\.length\)/);
  assert.doesNotMatch(source, /report\.coverage\.review > 0 \? `\$\{report\.coverage\.review\} review`/);
  assert.match(modelSource, /buildNonEssentialInventoryTallies\([\s\S]*inventoryProjection\.ungroupedRows/);
  assert.doesNotMatch(modelSource, /third_party_request_count/);
});

test("Accept and Reject cards appear together in expandable consent surfaces", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );
  const modelSource = await readFile(
    "apps/web/components/scans/report-lab/timeline-report-model.ts",
    "utf8"
  );

  assert.match(source, /data-testid="timeline-accept-path-card"/);
  assert.match(source, /data-testid="timeline-reject-path-card"/);
  assert.match(source, /data-testid="executive-accept-path-card"/);
  assert.match(source, /After Accept/);
  assert.match(source, /Retained Accept-path evidence/);
  assert.match(source, /report\.acceptPath \|\| report\.rejectPath[\s\S]*sm:grid-cols-2/);
  assert.match(source, /No qualifying post-Reject request or storage write was retained/);
  assert.match(source, /Observation window complete/);
  assert.match(modelSource, /Saved consent did not match Accept/);
  assert.match(modelSource, /consent record saved afterward still said analytics and advertising were not allowed/);
  assert.match(modelSource, /projectExecutiveFindingsFromUnifiedPackets/);
  assert.match(modelSource, /finding\.unifiedFindingId === "acceptance_signal_contradicts_action"/);
  assert.match(modelSource, /acceptContradictionRow \? \[acceptContradictionRow\] : \[\]/);
  assert.doesNotMatch(modelSource, /score-neutral|does not affect score|second score effect/);
});

test("GPC appears as a quiet snapshot signal and a dedicated evidence-index comparison", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );
  const modelSource = await readFile(
    "apps/web/components/scans/report-lab/timeline-report-model.ts",
    "utf8"
  );

  assert.match(source, /data-testid="executive-gpc-snapshot"/);
  assert.match(source, /The dedicated GPC lane was not requested for this scan/);
  assert.match(source, /no verified canonical GPC response reached this report/);
  assert.match(source, />Global Privacy Control</);
  assert.match(source, /CA −\{report\.gpcResponse\.californiaDeductionPoints\}/);
  assert.match(source, /href="#gpc-evidence"/);
  assert.match(source, /data-testid="gpc-evidence-index-card"/);
  assert.match(source, />GPC comparison</);
  assert.match(source, /Typed comparison evidence/);
  assert.match(source, /"Advertising \/ measurement"/);
  assert.match(source, /"Consent \/ CMP"/);
  assert.match(modelSource, /buildGpcResponseReportProjection\(canonical\.ownerUnifiedFindings\)/);
  assert.doesNotMatch(source, /GPC violation|GPC not honored/i);
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
  assert.match(source, /max-h-\[20rem\] overflow-auto/);
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
  assert.match(source, /min-w-\[98rem\]/);
  assert.match(source, /\["More", "w-\[5\.5rem\]"\], \["Type", "w-\[4rem\]"\], \["Vendor", "w-\[10rem\]"\], \["Name", "w-\[9rem\]"\]/);
  assert.match(source, /\["Purpose", "w-\[14rem\]"\]/);
  assert.match(source, /<InventoryTypeIcon type=\{row\.type\} \/>[\s\S]*<VendorBrandChip label=\{row\.vendor\}[\s\S]*<InventoryNameDisclosure className="leading-5" fullName=\{row\.name\} \/>/);
  assert.match(source, /function InventoryPurposeChip/);
  assert.match(source, /h-6 max-w-full min-w-0 items-center rounded-md/);
  assert.match(source, /truncate whitespace-nowrap leading-4/);
  assert.match(source, /<InventoryPurposeChip purpose=\{row\.purpose\} \/>/);
  assert.match(source, /group\/inventory-row border-b border-zinc-100 align-middle/);
  assert.match(source, /function SingleLineCell/);
  assert.match(source, /<SingleLineCell title=\{row\.domains\}>\{row\.domains\}<\/SingleLineCell>/);
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
