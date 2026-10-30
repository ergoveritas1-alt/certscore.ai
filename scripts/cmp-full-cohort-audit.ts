import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assessConsentActionStages, postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport,
} from "../packages/certscore-contracts/src/index";
import { canonicalizeKnownCmpName } from "../packages/shared/src/known-cmps";

type Action = "accept" | "reject";
type Source = { file: string; sha256: string; bytes?: number };
type ArchiveRow = {
  scanId: string; site: string; action: Action; cmp: string; click: boolean | null;
  registration: string; observationCompleted: boolean | null; reason: string; source: Source;
};
type PacketRow = { scanId: string; site: string; action: Action; registration: string; source: Source };
type Manifest = {
  policyVersion: "cmp_fixed_archive_cohort.v1"; input: Source; actions: Source; packets: Source; providerAliases: Source;
  expected: { exportFiles: number; actionRows: number; completedClicks: number; packetRows: number };
};
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const key = (row: { scanId: string; action: string }) => JSON.stringify([row.scanId, row.action]);
const source = (file: string): Source => {
  const bytes = readFileSync(file);
  return { file: resolve(file), sha256: sha(bytes), bytes: bytes.length };
};
function readVerified(ref: Source): unknown {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error("Invalid source reference");
  const bytes = readFileSync(ref.file);
  if (sha(bytes) !== ref.sha256 || (ref.bytes !== undefined && bytes.length !== ref.bytes)) throw Error("Source hash/size mismatch: " + ref.file);
  return JSON.parse(bytes.toString());
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected object");
  return value as Record<string, any>;
}
function observation(exported: Record<string, any>, action: Action) {
  return object(exported[action === "accept" ? "postAcceptObservation" : "postRefusalObservation"] ?? {});
}
function registrationStatus(observation: Record<string, any>): string {
  const status = observation.status;
  return ["confirmed", "unconfirmed", "aborted"].includes(status) ? status
    : ["confirmed_observation", "confirmed_clean"].includes(status) ? "confirmed" : "not_checked";
}
export function verifyArchiveRows(rows: ArchiveRow[]) {
  const seen = new Set<string>(), exports = new Map<string, Record<string, any>>();
  for (const row of rows) {
    if (!row.scanId || !row.site || !["accept", "reject"].includes(row.action)) throw Error("Invalid action identity");
    if (seen.has(key(row))) throw Error("Duplicate scan/action identity");
    seen.add(key(row));
    // A path is not an identity: each independently declared checksum must match.
    let exported = exports.get(row.source.file);
    if (!exported) { exported = object(readVerified(row.source)); exports.set(row.source.file, exported); }
    else if (source(row.source.file).sha256 !== row.source.sha256) throw Error("Conflicting source hash");
    if (row.source.bytes !== undefined && readFileSync(row.source.file).length !== row.source.bytes) throw Error("Source size mismatch");
    if (exported.scanId !== row.scanId || exported.scan_id && exported.scan_id !== row.scanId) throw Error("Export/scan identity mismatch");
    if (String(exported.domain).toLowerCase() !== row.site.toLowerCase()) throw Error("Export/site identity mismatch");
    const ob = observation(exported, row.action);
    const ex = object(ob.execution ?? {});
    if ((ex.clickCompleted ?? null) !== row.click || (ex.observationCompleted ?? null) !== row.observationCompleted || registrationStatus(ob) !== row.registration) throw Error("Export action facts disagree with cohort row");
    const cmp = exported.consentSurfaceEvidence?.consentSummary?.cmpName || "not_identified";
    if (cmp !== row.cmp || (ob.indeterminateReason || "none_retained") !== row.reason) throw Error("Export attribution/reason disagrees with cohort row");
  }
  return exports;
}
export function summarizeArchive(rows: Array<{ provider: string; site: string; registration: string }>) {
  return [...new Set(rows.map(r => r.provider))].map(provider => {
    const sample = rows.filter(r => r.provider === provider);
    const confirmed = sample.filter(r => r.registration === "confirmed").length;
    const unconfirmed = sample.filter(r => r.registration === "unconfirmed").length;
    const unresolved = sample.length - confirmed - unconfirmed;
    return { provider, completedClicks: sample.length, confirmed, unconfirmed, unresolved,
      aborted: sample.filter(r => r.registration === "aborted").length,
      distinctSites: new Set(sample.map(r => r.site)).size,
      affectedSites: new Set(sample.filter(r => r.registration !== "confirmed").map(r => r.site)).size,
      confirmedPct: 100 * confirmed / sample.length };
  }).sort((a, b) => b.completedClicks - a.completedClicks || a.provider.localeCompare(b.provider));
}
export type PacketReplayRow = {
  scanId: string; site: string; action: Action; source: Source;
  initialRegistrationStatus: string; terminalDecisionRetained: boolean;
  stages: { provider: string | null; measures: { decisionVerified: boolean | null; clickCompleted?: boolean | null; observationCompleted?: boolean | null } };
};
export function summarizePacketReplay(rows: PacketReplayRow[]) {
  if (!rows.length) return [];
  const groups = ["Overall", ...new Set(rows.map(r => r.stages.provider ?? "CMP identity unverified"))];
  return groups.map(provider => {
    const sample = provider === "Overall" ? rows : rows.filter(r => (r.stages.provider ?? "CMP identity unverified") === provider);
    const initialConfirmed = sample.filter(r => r.initialRegistrationStatus === "confirmed").length;
    const initialUnconfirmed = sample.filter(r => r.initialRegistrationStatus === "unconfirmed").length;
    const operationalConfirmed = sample.filter(r => r.stages.measures.decisionVerified === true).length;
    return { provider, actions: sample.length, sites: new Set(sample.map(r => r.site)).size,
      completedClicks: sample.filter(r => r.stages.measures.clickCompleted === true).length,
      completedObservations: sample.filter(r => r.stages.measures.observationCompleted === true).length,
      initialConfirmed, initialUnconfirmed, initialOther: sample.length - initialConfirmed - initialUnconfirmed,
      operationalConfirmed, operationalNotConfirmed: sample.filter(r => r.stages.measures.decisionVerified === false).length,
      operationalUnknown: sample.filter(r => r.stages.measures.decisionVerified === null).length,
      verifiedTerminalEvidence: sample.filter(r => r.terminalDecisionRetained && r.stages.measures.decisionVerified === true).length,
      initialConfirmedPct: 100 * initialConfirmed / sample.length, operationalConfirmedPct: 100 * operationalConfirmed / sample.length };
  });
}
/** Compare the full original-packet stratum, including rows with no completed-click export join. */
export function comparePacketReplays(before: PacketReplayRow[], after: PacketReplayRow[]) {
  const index = (rows: PacketReplayRow[]) => {
    const result = new Map<string, PacketReplayRow>();
    for (const row of rows) { if (result.has(key(row))) throw Error("Duplicate packet identity in comparison"); result.set(key(row), row); }
    return result;
  };
  const old = index(before), current = index(after);
  if (old.size !== current.size) throw Error("Full packet comparison denominator changed");
  const changes = after.flatMap(row => {
    const b = old.get(key(row));
    if (!b || b.source.sha256 !== row.source.sha256 || b.source.bytes !== row.source.bytes || b.site !== row.site) throw Error("Full packet comparison evidence drift");
    const initialChanged = b.initialRegistrationStatus !== row.initialRegistrationStatus;
    const decisionChanged = b.stages.measures.decisionVerified !== row.stages.measures.decisionVerified;
    const attributionChanged = b.stages.provider !== row.stages.provider;
    const terminalChanged = b.terminalDecisionRetained !== row.terminalDecisionRetained;
    return initialChanged || decisionChanged || attributionChanged || terminalChanged
      ? [{ scanId: row.scanId, action: row.action, site: row.site, initialChanged, decisionChanged, attributionChanged, terminalChanged,
          beforeOperationalConfirmed: b.stages.measures.decisionVerified, afterOperationalConfirmed: row.stages.measures.decisionVerified,
          source: row.source }] : [];
  });
  const prior = summarizePacketReplay(before), next = summarizePacketReplay(after);
  return { comparedActions: after.length, changes,
    distinctSitesWithNewConfirmation: new Set(changes.filter(r => r.beforeOperationalConfirmed !== true && r.afterOperationalConfirmed === true).map(r => r.site)).size,
    distinctSitesWithLostConfirmation: new Set(changes.filter(r => r.beforeOperationalConfirmed === true && r.afterOperationalConfirmed !== true).map(r => r.site)).size,
    providers: [...new Set([...prior, ...next].map(r => r.provider))].map(provider => {
      const b = prior.find(r => r.provider === provider) ?? null, a = next.find(r => r.provider === provider) ?? null;
      return { provider, before: b, after: a,
        initialPercentagePointChange: b && a ? a.initialConfirmedPct - b.initialConfirmedPct : null,
        operationalPercentagePointChange: b && a ? a.operationalConfirmedPct - b.operationalConfirmedPct : null };
    }) };
}
export function freezeArchiveCohort(rankingDirectory: string, manifestPath: string) {
  if (existsSync(manifestPath)) throw Error("Manifest already exists");
  const actions = source(join(rankingDirectory, "action-rows.json"));
  const packets = source(join(rankingDirectory, "verified-packets.json"));
  const rows = readVerified(actions) as ArchiveRow[];
  const exports = verifyArchiveRows(rows);
  const manifest: Manifest = { policyVersion: "cmp_fixed_archive_cohort.v1", input: source(join(rankingDirectory, "input.json")), actions, packets, providerAliases: source(join(rankingDirectory, "ranked-summary.json")),
    expected: { exportFiles: exports.size, actionRows: rows.length, completedClicks: rows.filter(r => r.click === true).length, packetRows: (readVerified(packets) as unknown[]).length } };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}
export function candidateFingerprint(root: string) {
  const paths = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "packages/certscore-contracts/src", "packages/certscore-scan-core/src", "packages/shared/src", "packages/certscore-report-adapter/src", "scripts/cmp-full-cohort-audit.ts", "scripts/cmp-full-cohort-audit.test.ts", "scripts/cmp-retained-failure-sweep.ts", "scripts/cmp-retained-failure-sweep.test.ts", "scripts/cmp-stage-benchmark.ts", "scripts/predeploy.ts", "scripts/lib/release-regression-selection.ts"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean))].sort();
  const files = Object.fromEntries(paths.map(path => [path, sha(readFileSync(join(root, path)))]));
  return { revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceFingerprint: sha(JSON.stringify(files)), workingTreeStatus: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }), files };
}
/** No decoder reconstruction: public exports and original typed packets remain
 * separate evidence strata. Missing packet/source/configuration values stay unknown. */
export type SupplementalPacketRow = PacketRow & {
  origin: { inventory: Source; retrievalReceipts: Source; eventIndex: number; uri: string };
};
export function verifyCoverageSupplement(path: string, fixedCohortSha256: string): SupplementalPacketRow[] {
  const supplement = object(JSON.parse(readFileSync(path, "utf8")));
  if (supplement.policyVersion !== "cmp_retained_coverage_supplement.v1" || supplement.fixedCohort?.sha256 !== fixedCohortSha256 || !Array.isArray(supplement.rows)) throw Error("Supplement/cohort binding mismatch");
  readVerified(supplement.fixedCohort);
  const seen = new Set<string>();
  for (const row of supplement.rows as SupplementalPacketRow[]) {
    if (seen.has(key(row))) throw Error("Duplicate supplemental identity"); seen.add(key(row));
    if (row.origin.eventIndex !== 0 || !["accept", "reject"].includes(row.action)) throw Error("Unsupported supplemental event/action");
    const inventory = readVerified(row.origin.inventory), receipts = readVerified(row.origin.retrievalReceipts);
    if (!Array.isArray(inventory) || !Array.isArray(receipts)) throw Error("Invalid original inventory/receipts");
    const entries = inventory.filter(i => i.id === row.scanId);
    if (entries.length !== 1) throw Error("Supplement inventory identity mismatch");
    const rawRetained = entries[0].retained;
    const retained = Array.isArray(rawRetained) ? rawRetained[row.origin.eventIndex] : rawRetained;
    const kind = row.action === "accept" ? "postAcceptPacketUri" : "postRefusalPacketUri";
    const expected = retained?.hashes?.[kind];
    if (retained?.pointers?.[kind] !== row.origin.uri || expected?.sha256 !== row.source.sha256 || expected?.sizeBytes !== row.source.bytes) throw Error("Supplement original pointer/hash binding mismatch");
    const matches = receipts.filter(r => r.scanId === row.scanId && r.kind === kind && (r.eventIndex ?? 0) === row.origin.eventIndex &&
      r.uri === row.origin.uri && r.verified === true && r.sha256 === row.source.sha256 && r.bytes === row.source.bytes &&
      r.expected?.sha256 === row.source.sha256 && r.expected?.sizeBytes === row.source.bytes);
    if (!matches.length) throw Error("Supplement original retrieval receipt mismatch");
    const packet = object(readVerified(row.source));
    if (packet.parentScanId !== row.scanId) throw Error("Supplement packet/scan identity mismatch");
  }
  return supplement.rows;
}
export function auditFullCohort(manifestPath: string, out: string, baselinePath?: string, supplementPath?: string) {
  if (existsSync(out)) throw Error("Choose a new immutable output directory");
  const manifest = object(JSON.parse(readFileSync(manifestPath, "utf8"))) as Manifest;
  if (manifest.policyVersion !== "cmp_fixed_archive_cohort.v1") throw Error("Unsupported cohort manifest");
  const input = object(readVerified(manifest.input));
  // Reuse the original reviewed display-label aliases, never derive identity from a domain.
  const aliases = object(object(readVerified(manifest.providerAliases)).displayAliases);
  const snapshot = object(readVerified({ file: input.snapshot, sha256: input.sha256 }));
  if (!Array.isArray(snapshot.rows)) throw Error("Invalid original cohort snapshot");
  const included = new Map(snapshot.rows.filter((r: any) => r.reportable).map((r: any) => [r.scanId, r]));
  const rows = readVerified(manifest.actions) as ArchiveRow[];
  const exports = verifyArchiveRows(rows);
  for (const row of rows) {
    const entry = included.get(row.scanId) as any;
    const refs = entry?.refs?.filter((r: any) => r.role === "hash_verified_bot_archive_export");
    if (refs?.length !== 1 || refs[0].file !== row.source.file || refs[0].sha256 !== row.source.sha256) throw Error("Cohort row is not bound to original snapshot");
  }
  const packets = readVerified(manifest.packets) as PacketRow[];
  const originalKeys = new Set(packets.map(key));
  const completedKeys = new Map(rows.filter(r => r.click === true).map(r => [key(r), r]));
  const supplementalRows = supplementPath ? verifyCoverageSupplement(supplementPath, source(manifestPath).sha256) : [];
  for (const row of supplementalRows) {
    if (originalKeys.has(key(row))) throw Error("Supplement duplicates original packet stratum");
    if (completedKeys.get(key(row))?.site !== row.site) throw Error("Supplement is outside fixed completed-click cohort");
  }
  const packetResults = new Map<string, any>();
  for (const row of [...packets, ...supplementalRows]) {
    if (packetResults.has(key(row))) throw Error("Duplicate packet scan/action identity");
    const raw = object(readVerified(row.source));
    if (raw.parentScanId !== row.scanId) throw Error("Packet/scan identity mismatch");
    const packet = row.action === "accept" ? postAcceptEvidencePacketSchema.parse(raw) : postRefusalEvidencePacketSchema.parse(raw);
    const p = row.action === "accept"
      ? projectPostAcceptEvidenceForReport({ packet: packet as Parameters<typeof projectPostAcceptEvidenceForReport>[0]["packet"], packetSha256: row.source.sha256 })
      : projectPostRefusalEvidenceForReport({ packet: packet as Parameters<typeof projectPostRefusalEvidenceForReport>[0]["packet"], packetSha256: row.source.sha256 });
    if (p.registrationStatus !== row.registration) throw Error("Historical initial registration changed");
    const stages = assessConsentActionStages(p);
    packetResults.set(key(row), { scanId: row.scanId, site: row.site, action: row.action, source: row.source,
      packetCohort: originalKeys.has(key(row)) ? "original_1466" : "coverage_supplement",
      initialRegistrationStatus: p.registrationStatus, terminalDecisionRetained: Boolean(p.terminalDecisionEvidence), stages });
  }
  const originalResults = [...packetResults.values()].filter(r => r.packetCohort === "original_1466");
  const supplementalResults = [...packetResults.values()].filter(r => r.packetCohort === "coverage_supplement");
  const completed = rows.filter(r => r.click === true);
  const actual = { exportFiles: exports.size, actionRows: rows.length, completedClicks: completed.length, packetRows: packets.length };
  if (JSON.stringify(actual) !== JSON.stringify(manifest.expected)) throw Error("Fixed cohort denominator drift");
  const auditRows = completed.map(row => {
    const exported = exports.get(row.source.file)!;
    const summary = exported.consentSurfaceEvidence?.consentSummary;
    const provider = row.cmp === "not_identified" ? "CMP identity unverified" : canonicalizeKnownCmpName(aliases[row.cmp] ?? row.cmp) ?? aliases[row.cmp] ?? row.cmp;
    const packetReplay = packetResults.get(key(row)) ?? null;
    return { ...row, provider, consentSurfaceObserved: summary?.consentSurfaceObserved ?? null,
      attributionScope: "starting_page_export" as const, packetReplay,
      replayCoverage: packetReplay ? "original_packet_verified" : "historical_export_only",
      replayLimitation: packetReplay ? null : "Historical schema cannot supply missing action-session receipt, applicability or terminal proof; no current-candidate runtime claim.",
      // Retain exported status verbatim. Action-session projection is separate.
      afterRegistration: row.registration };
  });
  const providers = summarizeArchive(auditRows);
  const overall = summarizeArchive(auditRows.map(r => ({ ...r, provider: "Overall" })))[0]!;
  let comparison = null;
  if (baselinePath) {
    const before = object(JSON.parse(readFileSync(baselinePath, "utf8")));
    if (before.cohort.sha256 !== source(manifestPath).sha256) throw Error("Cannot compare different cohorts");
    if ((before.supplementalPacketReplay?.source?.sha256 ?? null) !== (supplementPath ? source(supplementPath).sha256 : null)) throw Error("Cannot compare different packet supplements");
    const bRows = new Map(before.rows.map((r: any) => [key(r), r]));
    if (bRows.size !== auditRows.length) throw Error("Comparison denominator changed");
    const changes = auditRows.flatMap(row => {
      const b = bRows.get(key(row)) as any;
      if (!b || b.source.sha256 !== row.source.sha256 || b.packetReplay?.source.sha256 !== row.packetReplay?.source.sha256) throw Error("Comparison evidence drift");
      const initialChanged = b.packetReplay?.initialRegistrationStatus !== row.packetReplay?.initialRegistrationStatus;
      const decisionChanged = b.packetReplay?.stages.measures.decisionVerified !== row.packetReplay?.stages.measures.decisionVerified;
      const attributionChanged = b.packetReplay?.stages.provider !== row.packetReplay?.stages.provider;
      return initialChanged || decisionChanged || attributionChanged ? [{ scanId: row.scanId, action: row.action, site: row.site, initialChanged, decisionChanged, attributionChanged }] : [];
    });
    comparison = { baseline: source(baselinePath), unchangedCompletedClickDenominator: auditRows.length, changes,
      fullOriginalPacketComparison: comparePacketReplays(before.originalPacketReplay.rows, originalResults),
      supplementalPacketComparison: comparePacketReplays(before.supplementalPacketReplay?.rows ?? [], supplementalResults),
      distinctSitesWithNewConfirmation: new Set(changes.filter(r => r.decisionChanged && auditRows.find(x => key(x) === key(r))?.packetReplay?.stages.measures.decisionVerified === true).map(r => r.site)).size,
      providers: providers.map(p => ({ provider: p.provider, before: before.providers.find((b: any) => b.provider === p.provider), after: p, percentagePointChange: p.confirmedPct - before.providers.find((b: any) => b.provider === p.provider).confirmedPct })) };
  }
  const result = { policyVersion: "cmp_full_cohort_audit.v1", generatedAt: new Date().toISOString(), cohort: source(manifestPath), historicalInput: input,
    candidate: candidateFingerprint(resolve(".")), actual, overall, providers,
    supplementalPacketReplay: { source: supplementPath ? source(supplementPath) : null, rows: supplementalResults, providers: summarizePacketReplay(supplementalResults) },
    coverage: { originalPackets: originalResults.length, supplementalPackets: supplementalResults.length, completedExportsWithAnyPacket: auditRows.filter(r => r.packetReplay).length, completedExportsWithoutAnyPacket: auditRows.filter(r => !r.packetReplay).length },
    originalPacketReplay: { rows: originalResults, providers: summarizePacketReplay(originalResults), completedExportRowsCovered: auditRows.filter(r => r.packetReplay?.packetCohort === "original_1466").length,
      completedExportRowsWithoutPacket: auditRows.filter(r => r.packetReplay?.packetCohort !== "original_1466").length,
      registrationUnchanged: true },
    reconciliation: auditRows.filter(r => !["confirmed", "unconfirmed"].includes(r.registration)), comparison,
    interpretation: "All fixed historical exports are rehashed and reconciled; all original typed packets are replayed under the named candidate. Export registration is historical, not a current-candidate runtime measurement. Starting-page identity and action-session identity are separate. Missing packets cannot acquire proof. Unknown and aborted rows remain in the denominator. No production report is rewritten.", rows: auditRows };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "audit.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  const table = ["Provider,Completed clicks,Confirmed,Unconfirmed,Unresolved,Aborted,Distinct sites,Confirmed percent", ...[overall, ...providers].map(p => [p.provider, p.completedClicks, p.confirmed, p.unconfirmed, p.unresolved, p.aborted, p.distinctSites, p.confirmedPct.toFixed(4)].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(","))];
  writeFileSync(join(out, "providers.csv"), table.join("\n") + "\n", { flag: "wx" });
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, input, out, baseline, supplement] = process.argv.slice(2);
  if (!input || !out) throw Error("Usage: cmp-full-cohort-audit.ts freeze <ranking-directory> <new manifest> | replay <manifest> <new output-directory> [baseline audit.json or -] [supplement.json]");
  if (command === "freeze") console.log(JSON.stringify(freezeArchiveCohort(input, out), null, 2));
  else if (command === "replay") { const r = auditFullCohort(input, out, baseline === "-" ? undefined : baseline, supplement); console.log(JSON.stringify({ actual: r.actual, overall: r.overall, originalPackets: r.originalPacketReplay.rows.length, completedExportRowsCovered: r.originalPacketReplay.completedExportRowsCovered, comparison: r.comparison }, null, 2)); }
  else throw Error("Unknown command");
}
