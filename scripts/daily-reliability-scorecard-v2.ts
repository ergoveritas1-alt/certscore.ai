/** Versioned U5 cohort adapter; v1 entrypoint and sealed results remain unchanged. */
/** Local-only CertScore.ai audit module. No fetching, scanning, product writes or deployments. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { RELIABILITY_VERSION, AREAS, obj, arr, label, facet, classifyTraffic, sourceFacets, actionFacts, applyAssessment, summarizeRows, compareRows, prioritize, stratum, type Obj, type Row } from "./lib/daily-reliability-scorecard-v2";

export const hash = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
function read(file: string, max = 80_000_000): unknown {
  if (statSync(file).size > max) throw Error("Audit input exceeds byte bound");
  return JSON.parse(readFileSync(file, "utf8"));
}
function save(out: string, name: string, value: unknown) {
  writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
function id(v: unknown): string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(v)) throw Error("Unsafe scan/run identity");
  return v;
}
function local(root: string, file: string): string {
  const resolved = realpathSync(file);
  if (!resolved.startsWith(realpathSync(root) + path.sep)) throw Error("Audit input escapes source directory");
  return resolved;
}
function fingerprint(root: string, file: string) {
  const resolved = local(root, file), bytes = readFileSync(resolved);
  return { file: path.relative(root, resolved), sha256: hash(bytes), bytes: bytes.length };
}
function toolSources() {
  const file = fileURLToPath(import.meta.url);
  return [file, path.join(path.dirname(file), "lib/daily-reliability-scorecard-v2.ts"), path.join(path.dirname(file), "lib/daily-reliability-scorecard.ts")].map(file => ({ file, sha256: hash(readFileSync(file)) }));
}
type Receipt = { scanId: string; kind: string; localPath: string; eventIndex?: number; verified: boolean; expected?: { sha256: string; sizeBytes: number } };
function original(root: string, receipt: Receipt): { value: Obj; ref: Row["sourceRefs"][number] } {
  const expected = receipt.expected;
  if (!receipt.verified || !expected || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 1 || expected.sizeBytes > 20_000_000) throw Error("Unverified original receipt");
  const file = local(root, receipt.localPath);
  if (statSync(file).size !== expected.sizeBytes) throw Error("Original artifact size mismatch");
  const bytes = readFileSync(file);
  if (hash(bytes) !== expected.sha256) throw Error("Original artifact checksum mismatch");
  return { value: obj(JSON.parse(bytes.toString("utf8"))), ref: { file: path.relative(root, file), sha256: expected.sha256, bytes: bytes.length } };
}
function safeSite(value: unknown) {
  try { return new URL(`https://${String(value)}`).hostname; } catch { return "unknown"; }
}
export function observeReliability(input: { run: string; out: string; invocation: "manual_validation" | "scheduled"; primaryRunId: string; windowStart: string; windowEnd: string }) {
  const root = realpathSync(input.run), requested = path.resolve(input.out);
  const out = path.join(realpathSync(path.dirname(requested)), path.basename(requested));
  if (out === root || out.startsWith(root + path.sep) || existsSync(out)) throw Error("Use a fresh sibling output directory; never overwrite a retained run");
  if (!["manual_validation", "scheduled"].includes(input.invocation)) throw Error("Unsupported invocation");
  id(input.primaryRunId);
  const start = Date.parse(input.windowStart), end = Date.parse(input.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error("Invalid frozen interval");
  const inventoryFile = path.join(root, "work-inventory-v2.json"), inventoryValue = read(inventoryFile);
  if (!Array.isArray(inventoryValue) || inventoryValue.length > 20_000) throw Error("Unsupported/bounded inventory required");
  const inventory = inventoryValue.map(obj), ids = inventory.map(v => id(v.id));
  if (new Set(ids).size !== ids.length) throw Error("Duplicate scan identities; reconcile overlap before scorecard");
  const receiptFile = path.join(root, "evidence-retrieval-receipts.json"), receiptsValue = read(receiptFile);
  if (!Array.isArray(receiptsValue)) throw Error("Unsupported original receipt manifest");
  const supportFile = path.join(root, "support-retrieval-receipts.json");
  const supportValue = existsSync(supportFile) ? read(supportFile) : [];
  if (!Array.isArray(supportValue)) throw Error("Unsupported support receipt manifest");
  const gpcReceiptFile = path.join(root, "gpc-retrieval-receipts.json");
  const gpcReceipts = existsSync(gpcReceiptFile) ? read(gpcReceiptFile) : [];
  if (!Array.isArray(gpcReceipts)) throw Error("Unsupported GPC receipt manifest");
  const receipts = [...receiptsValue, ...supportValue] as Receipt[], rows: Row[] = [];
  for (const item of inventory) {
    // The primary cohort must contain only the frozen new interval. Carry/overlap
    // verification belongs in a separate scorecard, never repeated trend counts.
    const created = Date.parse(String(item.created_at));
    if (!Number.isFinite(created) || created < start || created >= end) throw Error("Inventory outside frozen interval; explicitly adapt new-only inventory");
    const scanId = id(item.id), refs: Row["sourceRefs"] = [];
    const load = (kind: string): { value: Obj; state: string } => {
      const matches = receipts.filter(r => r.scanId === scanId && r.kind === kind && (r.eventIndex === undefined || r.eventIndex === 0));
      if (!matches.length) return { value: {}, state: "unavailable" };
      if (matches.length !== 1) return { value: {}, state: "invalid" };
      try {
        const verified = original(root, matches[0]!);
        const actionLane = kind === "postAcceptPacketUri" ? "accept_observation" : kind === "postRefusalPacketUri" ? "reject_observation" : null;
        if (actionLane ? verified.value.parentScanId !== scanId || ![scanId, `${scanId}:${actionLane}`].includes(String(verified.value.scanId)) : verified.value.scanId !== scanId) throw Error("Original source identity mismatch");
        if (["scanArtifactUri", "manifestUri", "postAcceptPacketUri", "postRefusalPacketUri"].includes(kind)) {
          const event = obj(arr(item.retained)[0]), expected = obj(obj(event.hashes)[kind]);
          if (expected.sha256 !== verified.ref.sha256 || expected.sizeBytes !== verified.ref.bytes || obj(event.pointers)[kind] !== obj(matches[0]).uri) throw Error("Receipt not bound to original inventory event");
        }
        refs.push(verified.ref); return { value: verified.value, state: "verified" };
      } catch { return { value: {}, state: "invalid" }; }
    };
    const canonical = load("scanArtifactUri"), manifest = load("manifestUri"), support = load("LocalV2DagLambdaShardSummary.json");
    const bundle = canonical.state === "verified" ? canonical.value : undefined;
    const facets = bundle ? sourceFacets(bundle, manifest.value, support.value) : {};
    for (const [key, configKey] of [["gpc_dispatch", "gpcObservationEnabled"], ["accept_configured", "postAcceptWorkerEnabled"], ["reject_configured", "postRefusalRejectWorkerEnabled"], ["explicit_opt_out_configured", "saleSharingOptOutEnabled"]] as const) {
      const configured = obj(item.lambda_config)[configKey];
      facets[key] = facet(configured === true ? "enabled" : configured === false ? "disabled" : "unknown");
    }
    if (bundle) {
      const assessment = obj(bundle.gpcResponseAssessment), comparison = obj(assessment.comparison), expected = obj(comparison.gpcArtifact);
      const matching = (gpcReceipts as Receipt[]).filter(r => r.scanId === scanId && obj(r).uri === expected.uri);
      facets.gpc_worker_integrity = facet("unavailable");
      if (matching.length) try {
        if (matching.length !== 1 || obj(assessment.observation).sourceSha256 !== expected.sha256) throw Error("GPC source binding mismatch");
        // The original canonical comparison supplies the expected worker hash;
        // a retrieval receipt's self-fingerprint alone is not an attestation.
        const worker = original(root, { ...matching[0]!, verified: true, expected: { sha256: String(expected.sha256), sizeBytes: Number(expected.sizeBytes) } });
        if (worker.value.scanId !== scanId) throw Error("GPC worker identity mismatch");
        refs.push(worker.ref); facets.gpc_worker_integrity = facet("verified");
        const session = obj(worker.value.gpcObservationSession), capture = obj(session.requestProofCapture), diagnostics = obj(capture.diagnostics);
        const numbers = Object.fromEntries(["obsoleteDocumentDropped", "capEvicted", "inspectionFailures"].flatMap(k => Number.isSafeInteger(diagnostics[k]) ? [[k, Number(diagnostics[k])]] : []));
        facets.gpc_proof_diagnostics = facet(Object.keys(diagnostics).length ? "retained" : "not_checked", [], numbers);
        facets.gpc_body_outcomes = facet(Object.keys(obj(diagnostics.bodyOutcomes)).length ? "retained" : "not_checked", [],
          Object.fromEntries(Object.entries(obj(diagnostics.bodyOutcomes)).filter(([,v]) => Number.isSafeInteger(v) && Number(v) >= 0).map(([k,v]) => [label(k), Number(v)])));
      } catch { facets.gpc_worker_integrity = facet("invalid"); }
    }
    const actions: Row["actions"] = {};
    for (const [key, kind] of [["accept", "postAcceptPacketUri"], ["reject", "postRefusalPacketUri"]] as const) {
      const packet = load(kind); actions[key] = actionFacts(packet.state === "verified" ? packet.value : undefined);
      actions[key]!.packet = packet.state;
    }
    if (bundle && obj(bundle.saleSharingOptOut).verificationStatus === "verified") {
      const wrapper = obj(bundle.saleSharingOptOut), packet = obj(wrapper.evidence), bytes = Buffer.from(JSON.stringify(packet));
      if (packet.scanId === scanId && hash(bytes) === wrapper.sha256 && bytes.length === wrapper.sizeBytes) {
        facets.explicit_opt_out = facet(packet.status, packet.limitations, { submitted: packet.submitted === true ? 1 : 0, confirmed: packet.registration === "confirmed" ? 1 : 0 });
        facets.explicit_opt_out_registration = facet(packet.registration);
      } else facets.explicit_opt_out = facet("invalid", ["embedded_packet_integrity"]);
    }
    rows.push({ scanId, site: safeSite(item.hostname), createdAt: new Date(created).toISOString(),
      ...(Number.isFinite(Date.parse(String(item.completed_at))) ? { completedAt: new Date(String(item.completed_at)).toISOString() } : {}),
      source: label(item.source), region: label(item.scan_from), status: label(item.status),
      cohort: classifyTraffic(item, bundle), producer: label(obj(bundle?.scannerBuildProvenance).gitSha), profile: label(manifest.value.privacyCaptureProfile),
      provider: "unknown", assessmentVersion: "unknown", projectionVersion: "unknown", reportability: item.status === "failed" ? "failed" : "unknown",
      bundleVerification: canonical.state, projectionVerification: "not_checked_before_pass_a", controls: {}, facets, actions, cmpRows: [], sourceRefs: refs });
  }
  const sources = [inventoryFile, receiptFile, ...(existsSync(supportFile) ? [supportFile] : []), ...(existsSync(gpcReceiptFile) ? [gpcReceiptFile] : [])].map(file => fingerprint(root, file));
  mkdirSync(out);
  save(out, "reliability-pass-a.json", { version: RELIABILITY_VERSION, inputRun: root, invocation: input.invocation, primaryRunId: input.primaryRunId,
    windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), sources, rows, toolSources: toolSources(),
    exposureDisclosure: "Mechanical source-coverage pass only; original bundles contain derived coverage/assessment metadata. No generated report snapshots read. This does not replace the primary independent semantic Pass A or establish human-adjudicated accuracy." });
  save(out, "reliability-pass-a-seal.json", { version: RELIABILITY_VERSION, sealedAtUtc: new Date().toISOString(), passASha256: hash(readFileSync(path.join(out, "reliability-pass-a.json"))), productSnapshotsRead: false });
  return { out, sourceRows: rows.length, scheduledInvocationsAddedByTool: 0 };
}
function validateSource(out: string) {
  const file = path.join(out, "reliability-pass-a.json"), prep = obj(read(file)), seal = obj(read(path.join(out, "reliability-pass-a-seal.json")));
  if (prep.version !== RELIABILITY_VERSION || seal.passASha256 !== hash(readFileSync(file))) throw Error("Reliability Pass A seal/version mismatch");
  if (JSON.stringify(prep.toolSources) !== JSON.stringify(toolSources())) throw Error("Audit tool changed after source seal; start a new output directory");
  const root = realpathSync(String(prep.inputRun));
  const rows = prep.rows as Row[];
  for (const ref of [...arr(prep.sources), ...rows.flatMap(r => r.sourceRefs)].map(obj)) {
    const actual = fingerprint(root, path.join(root, String(ref.file)));
    if (ref.sha256 !== actual.sha256 || ref.bytes !== actual.bytes) throw Error("Source changed after coverage seal");
  }
  return { prep, rows, root };
}
export async function scoreReliability(input: { out: string; primarySeal: string; previous?: string }) {
  const out = realpathSync(input.out);
  if (existsSync(path.join(out, "reliability-scorecard.json"))) throw Error("Scorecard already saved; use a new output directory");
  const { prep, rows, root } = validateSource(out);
  const primarySealFile = local(root, input.primarySeal), primarySeal = obj(read(primarySealFile));
  const primaryObserved = local(root, String(primarySeal.file));
  if (typeof primarySeal.sha256 !== "string" || hash(readFileSync(primaryObserved)) !== primarySeal.sha256) throw Error("Primary independent Pass A seal is required before product reads");
  const { readPersistedScanReportProjection } = await import("../apps/web/server/scans/scan-report-projection-contract");
  const compared: Row[] = [], snapshots: { file: string; sha256: string; bytes: number }[] = [];
  for (const originalRow of rows) {
    const row = structuredClone(originalRow), file = path.join(root, "scans", row.scanId, "persisted", "snapshot.json");
    if (row.cohort !== "ordinary") { row.projectionVerification = "not_applicable_excluded_cohort"; compared.push(row); continue; }
    if (!existsSync(file)) { row.projectionVerification = "unavailable"; compared.push(row); continue; }
    try {
      const snapshot = obj(read(local(root, file), 20_000_000)); snapshots.push(fingerprint(root, file));
      const record = readPersistedScanReportProjection({ scan: { id: row.scanId, status: row.status }, snapshot } as Parameters<typeof readPersistedScanReportProjection>[0]);
      if (!record) { row.projectionVerification = row.status === "completed" ? "unreadable" : "not_applicable_terminal_without_report"; compared.push(row); continue; }
      const assessment = obj(obj(record.snapshot).consentControlAssessment);
      if (obj(assessment.provenance).sourceHash !== snapshot.consent_assessment_source_hash) throw Error("Assessment persistence source mismatch");
      const applied = applyAssessment(row, assessment, { version: snapshot.report_projection_version });
      const computed = Date.parse(String(snapshot.report_projection_computed_at)), completed = Date.parse(String(row.completedAt));
      const duration = computed - completed;
      applied.facets.publication_latency = Number.isFinite(duration) && duration >= 0 ? facet("retained_timestamps", [], { durationMs: duration }) : facet("not_checked", ["missing_or_nonmonotonic_timestamps"]);
      compared.push(applied);
    } catch { row.projectionVerification = "invalid"; compared.push(row); }
  }
  const summary = summarizeRows(compared), strata = [...new Set(compared.filter(r => r.cohort === "ordinary").map(stratum))].sort();
  let comparison: unknown = { status: "baseline_only", improvementClaim: false }, previousRef: unknown = null;
  if (input.previous) {
    const previousDir = realpathSync(input.previous), prevFile = path.join(previousDir, "reliability-scorecard.json"), prev = obj(read(prevFile));
    const priorSeal = obj(read(path.join(previousDir, "reliability-final-seal.json"))), priorRowsFile = path.join(previousDir, "reliability-per-scan.json");
    if (prev.version !== RELIABILITY_VERSION || priorSeal.scorecardSha256 !== hash(readFileSync(prevFile)) || priorSeal.rowsSha256 !== hash(readFileSync(priorRowsFile))) throw Error("Invalid previous scorecard/version/seal");
    if (prep.invocation !== "scheduled" || prev.invocation !== "scheduled" || prep.primaryRunId === prev.primaryRunId || Date.parse(String(prev.windowEnd)) > Date.parse(String(prep.windowStart))) {
      comparison = { status: "not_comparable", reason: "manual_same_invocation_or_overlapping_windows", improvementClaim: false };
    } else comparison = compareRows(compared, read(priorRowsFile) as Row[]);
    previousRef = { file: prevFile, sha256: hash(readFileSync(prevFile)) };
  }
  const scorecard = { version: RELIABILITY_VERSION, completedAtUtc: new Date().toISOString(), invocation: prep.invocation, primaryRunId: prep.primaryRunId,
    windowStart: prep.windowStart, windowEnd: prep.windowEnd, summary,
    areaInventory: AREAS.map(area => ({ area, priority: area === "control_identification" ? 1 : area === "gpc" ? 2 : area === "cmp_details" ? 3 : 4,
      interpretation: "See measured facets; unavailable semantic checks remain not checked. No finding or accuracy claim is created." })),
    stratified: strata.map(key => ({ dimensions: JSON.parse(key), summary: summarizeRows(compared.filter(r => r.cohort === "ordinary" && stratum(r) === key)) })),
    comparison, previous: previousRef, scheduledInvocationsAddedByTool: 0, productionAccess: false,
    integrityLimitations: compared.flatMap(r => [
      ...(r.bundleVerification === "invalid" ? [{ scanId: r.scanId, component: "original_bundle" }] : []),
      ...(r.projectionVerification === "invalid" || r.projectionVerification === "unreadable" ? [{ scanId: r.scanId, component: "persisted_projection" }] : []),
      ...(r.facets.gpc_worker_integrity?.state === "invalid" ? [{ scanId: r.scanId, component: "gpc_worker" }] : []),
      ...Object.entries(r.actions).filter(([,a]) => a.packet === "invalid").map(([lane]) => ({ scanId: r.scanId, component: `${lane}_packet` })),
    ]),
    gapQueueMeaning: "Coverage candidates for the existing review allocation, not confirmed defects or automatic new deep reviews. Intentionally omitted CMP inventory is not a worker failure." };
  save(out, "reliability-per-scan.json", compared);
  save(out, "reliability-review-candidates.json", prioritize(compared));
  save(out, "reliability-product-sources.json", { snapshots, primarySeal: fingerprint(root, primarySealFile) });
  save(out, "reliability-scorecard.json", scorecard);
  const csv = (v: string) => '"' + (/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
  writeFileSync(path.join(out, "reliability-per-scan.csv"), ["scanId,cohort,producer,region,profile,reportability,accept,reject,options,gpc,cmpDispatch", ...compared.map(r => [r.scanId, r.cohort, r.producer, r.region, r.profile, r.reportability,
    r.controls.accept?.state ?? "not_checked", r.controls.reject?.state ?? "not_checked", r.controls.options?.state ?? "not_checked", r.facets.gpc_observation?.state ?? "not_checked", r.facets.cmp_dispatch?.state ?? "not_checked"].map(csv).join(","))].join("\n") + "\n", { flag: "wx" });
  save(out, "reliability-final-seal.json", { version: RELIABILITY_VERSION, scorecardSha256: hash(readFileSync(path.join(out, "reliability-scorecard.json"))),
    rowsSha256: hash(readFileSync(path.join(out, "reliability-per-scan.json"))), passASha256: hash(readFileSync(path.join(out, "reliability-pass-a.json"))),
    productSourcesSha256: hash(readFileSync(path.join(out, "reliability-product-sources.json"))), reviewCandidatesSha256: hash(readFileSync(path.join(out, "reliability-review-candidates.json"))) });
  return { out, ordinaryReportable: summary.population.ordinaryReportable, comparison };
}
async function main(argv: string[]) {
  const command = argv.shift(), args = new Map<string, string>();
  while (argv.length) {
    const key = argv.shift(), value = argv.shift();
    if (!key?.startsWith("--") || !value || value.startsWith("--") || args.has(key)) throw Error("Expected unique --key value arguments");
    args.set(key, value);
  }
  const required = (key: string) => { const value = args.get(key); if (!value) throw Error(`Missing ${key}`); return value; };
  const allowed = command === "observe" ? ["--run", "--out", "--invocation", "--primary-run-id", "--window-start", "--window-end"] : ["--out", "--primary-pass-a-seal", "--previous"];
  if ([...args.keys()].some(k => !allowed.includes(k))) throw Error("Unknown argument");
  if (command === "observe") console.log(JSON.stringify(observeReliability({ run: required("--run"), out: required("--out"), invocation: required("--invocation") as "manual_validation" | "scheduled",
    primaryRunId: required("--primary-run-id"), windowStart: required("--window-start"), windowEnd: required("--window-end") })));
  else if (command === "score") console.log(JSON.stringify(await scoreReliability({ out: required("--out"), primarySeal: required("--primary-pass-a-seal"), previous: args.get("--previous") })));
  else throw Error("Use observe or score");
}
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main(process.argv.slice(2)).catch(error => { console.error(String(error)); process.exitCode = 1; });
