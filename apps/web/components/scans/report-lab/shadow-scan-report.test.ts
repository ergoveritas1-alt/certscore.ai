import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getGpcSnapshotLabel } from "./shadow-scan-report";

test("every GPC snapshot status stays below twenty characters", () => {
  for (const status of ["responsive", "no_observable_response", "indeterminate"] as const) {
    assert.ok(getGpcSnapshotLabel(status).length < 20);
  }
  assert.equal(getGpcSnapshotLabel("indeterminate"), "Indeterminate");
});
import { countNonNotObservedRows, countRowsRequiringReview } from "./evidence-directory-summary";
import { buildRuntimeInventoryCopyPayload } from "./inventory-table-copy";
import { buildRuntimeInventoryPurposeCounts } from "../runtime-observation-sections";
import { getConsentControlSummaryLabel, getPolicySurfaceCoverageStatus } from "./timeline-report-model";

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

test("evidence directory review counts exclude positive and contextual rows", () => {
  assert.equal(countRowsRequiringReview([
    { status: "Potential gap" },
    { status: "Partial concern" },
    { status: "Not confirmed" },
    { status: "Limited" },
    { status: "Observed" },
    { status: "Context" },
    { status: "Not observed" },
  ]), 4);
});

test("policy surface coverage preserves limited and unavailable states", () => {
  assert.equal(getPolicySurfaceCoverageStatus({
    policySurfaceInspection: {
      coverageStatus: "limited",
      inspectionCompleted: false,
      limitationKeys: ["policy_surface_inspection_runtime_partial"],
    },
  }), "limited");
  assert.equal(getPolicySurfaceCoverageStatus({
    hybrid_runtime_evidence: {
      policy_surface_inspection: {
        coverage_status: "complete",
        inspection_completed: true,
        limitation_keys: [],
      },
    },
  }), "complete");
  assert.equal(getPolicySurfaceCoverageStatus(null), "unavailable");
});

test("consent control summary distinguishes unknown coverage from verified absence", () => {
  assert.equal(getConsentControlSummaryLabel({
    accept: "Unknown",
    options: "Unknown",
    reject: "Unknown",
  }), "Coverage limited");
  assert.equal(getConsentControlSummaryLabel({
    accept: "Observed",
    options: "Unknown",
    reject: "Not observed",
  }), "1 observed · 1 not observed · 1 unknown");
  assert.equal(getConsentControlSummaryLabel({
    accept: "Not observed",
    options: "Not observed",
    reject: "Not observed",
  }), "0 of 3 observed");
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

test("evidence section headings distinguish review, observed, and total check counts", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );

  assert.match(source, /\{trackingExternalReviewCount\} requiring review · \{report\.trackingExternalRows\.length\} checks/);
  assert.match(source, /\{preConsentRuntimeReviewCount\} requiring review · \{report\.preConsentRuntimeRows\.length\} checks/);
  assert.match(source, /\{observedGdprTransparencyRows\} observed · \{report\.gdprTransparencyRows\.length\} checks/);
  assert.match(source, /positive · \{report\.transportRows\.length\} checks/);
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
  assert.doesNotMatch(source, /label: "3rd party embeds"/);
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
  const choicePathCardSource = source.slice(
    source.indexOf("function ChoicePathCard"),
    source.indexOf("function ChoicePathResults"),
  );

  assert.match(source, /data-testid="timeline-accept-path-card"/);
  assert.match(source, /data-testid="timeline-reject-path-card"/);
  assert.match(source, /data-testid="executive-accept-path-card"/);
  assert.match(source, /After Accept/);
  assert.match(source, /Retained Accept-path evidence/);
  assert.match(source, /report\.acceptPath \|\| report\.rejectPath[\s\S]*sm:grid-cols-2/);
  assert.match(source, /No qualifying post-Reject request or storage write was retained/);
  assert.match(source, /Observation window complete/);
  assert.match(choicePathCardSource, /<details/);
  assert.match(choicePathCardSource, /<summary/);
  assert.match(choicePathCardSource, /group-open\/path:rotate-180/);
  assert.doesNotMatch(choicePathCardSource, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(choicePathCardSource, /px-3 py-2\.5/);
  assert.match(choicePathCardSource, /<\/summary>\s*<div[^>]*>\s*<h4/);
  assert.match(choicePathCardSource, /<div className="mt-2\.5 border-t border-zinc-200 pt-2\.5">/);
  assert.match(modelSource, /Saved consent did not match Accept/);
  assert.match(modelSource, /consent record saved afterward still said analytics and advertising were not allowed/);
  assert.match(modelSource, /projectExecutiveFindingsFromUnifiedPackets/);
  assert.match(modelSource, /finding\.unifiedFindingId === "acceptance_signal_contradicts_action"/);
  assert.match(modelSource, /acceptContradictionRow \? \[acceptContradictionRow\] : \[\]/);
  assert.doesNotMatch(modelSource, /score-neutral|does not affect score|second score effect/);
});

test("report header actions and section spacing match the compact report treatment", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );
  const actionsSource = await readFile(
    "apps/web/components/scans/report-lab/shadow-report-actions.tsx",
    "utf8"
  );
  const captureActionsSource = await readFile(
    "apps/web/components/scans/share-report-actions.tsx",
    "utf8"
  );
  const executiveGridSource = await readFile(
    "apps/web/components/scans/report-lab/expandable-executive-grid.tsx",
    "utf8"
  );
  const identitySource = source.slice(
    source.indexOf("function ReportIdentity"),
    source.indexOf("function ScoreScale"),
  );
  const choicePathSource = source.slice(
    source.indexOf("function ChoicePathResults"),
    source.indexOf("type InventoryMixItem"),
  );
  assert.match(choicePathSource, /report\.acceptPath\.state !== "incomplete"/);
  assert.match(choicePathSource, /report\.rejectPath\.state !== "incomplete"/);
  assert.match(choicePathSource, /if \(!acceptSucceeded && !rejectSucceeded\) return null/);
  const evidenceDirectorySource = source.slice(source.indexOf("function EvidenceDirectory"));

  assert.match(identitySource, /className="!h-7 !w-7 translate-y-0\.5 !rounded-md !border-zinc-200 !bg-zinc-50 !p-1 !shadow-sm"/);
  assert.match(identitySource, /label=\{report\.scan\.host\}/);
  assert.match(identitySource, /Scanned from \{report\.scan\.origin\}/);
  assert.doesNotMatch(identitySource, /Executed from/);
  assert.match(identitySource, /flex items-center justify-between gap-3/);
  assert.match(identitySource, /flex shrink-0 flex-wrap items-center gap-2/);
  assert.doesNotMatch(identitySource, /href="#evidence"/);
  assert.match(actionsSource, /aria-label="Share report"/);
  assert.match(actionsSource, /bg-white[^"]*text-zinc-950/);
  assert.match(actionsSource, /<svg aria-hidden="true"/);
  assert.match(actionsSource, />\s*Share\s*<\/summary>/);
  assert.doesNotMatch(actionsSource, /Share \/ export|⌄/);
  assert.match(captureActionsSource, /aria-label="View captured image"/);
  assert.doesNotMatch(captureActionsSource, />View capture<\/span>/);
  assert.match(executiveGridSource, /mt-6 grid gap-8 border-t border-zinc-200 pt-6/);
  assert.doesNotMatch(source.slice(source.indexOf("function ScoreScale"), source.indexOf("function CoverageBar")), /line-clamp/);
  assert.match(source, /Indeterminate · limited comparison coverage/);
  assert.match(source, /function DisclosureChevron/);
  assert.doesNotMatch(source, /rotate-45|>\+<\/span>/);
  assert.doesNotMatch(choicePathSource, /Confirmed outcomes retained after first-layer consent choices/);
  assert.match(choicePathSource, /mt-3 border-t border-zinc-300 pt-2\.5/);
  assert.match(choicePathSource, /mt-1\.5 grid items-start gap-2 sm:grid-cols-2/);
  assert.match(evidenceDirectorySource, /px-5 py-8 lg:px-10 lg:py-10/);
  assert.match(evidenceDirectorySource, /mt-6 grid items-start/);
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
  assert.match(source, /predates always-on GPC coverage/);
  assert.match(source, /no verified canonical GPC response reached this report/);
  const snapshotSource = source.slice(
    source.indexOf("function SignalSnapshot"),
    source.indexOf("function BenchmarkComparison")
  );
  const gpcEvidenceCardSource = source.slice(
    source.indexOf("function GpcEvidenceIndexCard"),
    source.indexOf("function EvidenceDirectory")
  );
  const evidenceDirectorySource = source.slice(source.indexOf("function EvidenceDirectory"));
  const consentPlatformIndex = snapshotSource.indexOf(">Consent platform<");
  const consentControlsIndex = snapshotSource.indexOf(">Consent controls<");
  const gpcIndex = snapshotSource.indexOf(">Global Privacy Control (GPC)<");
  const trackerFootprintIndex = snapshotSource.indexOf(">Tracker footprint<");
  const transportSecurityIndex = snapshotSource.indexOf(">HTTPS / TLS<");
  const runtimeIndex = evidenceDirectorySource.indexOf(">Pre-consent runtime<");
  const gpcCardIndex = evidenceDirectorySource.indexOf("<GpcEvidenceIndexCard");
  const transportIndex = evidenceDirectorySource.indexOf(">Transport security<");

  assert.ok(consentPlatformIndex >= 0);
  assert.ok(consentPlatformIndex < consentControlsIndex);
  assert.ok(consentControlsIndex < trackerFootprintIndex);
  assert.ok(trackerFootprintIndex < transportSecurityIndex);
  assert.ok(transportSecurityIndex < gpcIndex);
  assert.match(snapshotSource, /<VendorBrandLogo label=\{consentVendor\} \/>/);
  assert.match(snapshotSource, /getGpcSnapshotLabel\(report\.gpcResponse\.assessment\.status\)/);
  assert.doesNotMatch(snapshotSource, /<GpcStatusBadge/);
  assert.match(source, /CA −\{report\.gpcResponse\.californiaDeductionPoints\}/);
  assert.match(source, /href="#gpc-evidence"/);
  assert.match(source, /data-testid="gpc-evidence-index-card"/);
  assert.match(gpcEvidenceCardSource, /whitespace-nowrap text-lg/);
  assert.doesNotMatch(gpcEvidenceCardSource, /<GpcStatusBadge/);
  assert.ok(runtimeIndex >= 0);
  assert.ok(runtimeIndex < gpcCardIndex);
  assert.ok(gpcCardIndex < transportIndex);
  assert.match(source, />GPC comparison</);
  assert.match(source, /Typed comparison evidence/);
  assert.match(source, /"Advertising \/ measurement"/);
  assert.match(source, /"Consent \/ CMP"/);
  assert.match(modelSource, /buildGpcResponseReportProjection\(canonical\.ownerUnifiedFindings\)/);
  assert.doesNotMatch(source, /GPC violation|GPC not honored/i);
  assert.match(source, /report\.policySurfaceCoverage === "limited"/);
  assert.match(source, /Policy discovery or document retrieval was incomplete/);
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
  assert.match(source, /max-h-\[17rem\] overflow-auto/);
  assert.doesNotMatch(source, /max-h-\[48rem\]/);
  assert.match(source, /data-inventory-scroll=/);
  assert.match(source, /detailsLabel="Resource details"/);
  assert.ok(source.includes('eyebrow="Resource inventory"'));
  assert.ok(source.includes("Field details in Collection surface evidence below."));
  assert.ok(source.indexOf("<RuntimeInventoryTable report={report} />") < source.indexOf("<ChoicePathResults report={report} />"));
  assert.ok(source.includes("detailsHint={<InventoryEvidenceLegend />}"));
  assert.doesNotMatch(source, /names, purposes, timing, domains, and evidence/);
  assert.match(runtimeSectionSource, /Show details/);
  assert.match(runtimeSectionSource, /Hide details/);
  assert.doesNotMatch(source, /Every retained cookie, storage, tracker, and request group from the canonical runtime inventory is available below/);
  assert.match(source, /heading="Cookies, storage, requests, and embeds"/);
  assert.doesNotMatch(source, /heading="Every retained vendor and request group"/);
  assert.match(source, /label="Copy entire cookies and trackers table"/);
  assert.match(source, /payload=\{copyPayload\}/);
  assert.match(source, /<thead className="sticky top-0/);
  assert.ok(source.includes("md:left-[4.5rem]"));
  assert.ok(source.includes("md:left-[7.5rem]"));
  assert.ok(source.includes('["Name", "w-[12rem]"]'));
  assert.ok(source.includes('hasRelationshipEvidence ? "min-w-[90rem]" : "min-w-[86rem]"'));
  assert.ok(source.includes('["Vendor", hasRelationshipEvidence ? "w-[14rem]" : "w-[10rem]"]'));
  assert.ok(source.includes('["Priority", "w-[4.5rem]"]'));
  assert.ok(source.includes("<InventoryEvidenceLegend />"));
  assert.ok(!source.includes('["Evidence mix", "w-[8rem]"]'));
  assert.match(source, /\["Purpose", "w-\[10rem\]"\]/);
  assert.match(source, /<InventoryTypeIcon type=\{row\.type\} \/>[\s\S]*<VendorBrandChip label=\{row\.vendor\}[\s\S]*<InventoryNameDisclosure compact className="leading-5" fullName=\{row\.name\} \/>/);
  assert.match(source, /import \{ InventoryConfidenceDots, InventoryPurposeChip \} from "\.\.\/inventory-cell-formatting"/);
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
