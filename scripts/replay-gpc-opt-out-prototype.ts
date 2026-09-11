import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildGpcOptOutPrototype, type GpcPrototypeArtifact } from "../packages/certscore-scan-core/src/gpc-opt-out-assessment";

/** Cached-only evaluation: no AWS calls, public contacts, persistence or projection. */
export async function replayGpcOptOutPrototype(input: { cohort: string; pairs: string; out: string; observations?: string }) {
  await mkdir(path.dirname(input.out), { recursive: true });
  await mkdir(input.out); // Fail before evaluation if a prior artifact would be overwritten.
  const records = (await readFile(input.cohort, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  const scans = records.filter(r => r.kind === "scan" && !String(r.domain).toLowerCase().split(".").includes("ergoveritas"));
  if (new Set(scans.map(r => r.id)).size !== scans.length) throw Error("Duplicate scan identities in calibration cohort");
  const rows = [];
  for (const scan of scans) {
    if (!/^[a-zA-Z0-9_-]+$/.test(scan.id)) throw Error("Invalid scan path identity");
    const sourceErrors: string[] = [];
    async function retained(lane: "baseline" | "gpc"): Promise<GpcPrototypeArtifact | undefined> {
      const pointer = scan.gpc?.comparison?.[`${lane}Artifact`];
      if (!pointer) return undefined;
      try { return { pointer, bytes: await readFile(path.join(input.pairs, scan.id, `${lane}.json`)) }; }
      catch { sourceErrors.push(`${lane}_artifact_missing`); return undefined; }
    }
    let observation: GpcPrototypeArtifact | undefined;
    if (input.observations) {
      // A sidecar manifest must have been retained with capture. Do not generate
      // a replacement expected hash for a file merely because it exists now.
      try {
        const directory = path.join(input.observations, scan.id);
        const pointer = JSON.parse(await readFile(path.join(directory, "GpcOptOutObservation.pointer.json"), "utf8"));
        observation = { pointer, bytes: await readFile(path.join(directory, "GpcOptOutObservation.json")) };
      } catch { sourceErrors.push("semantic_sidecar_unavailable"); }
    }
    const [baseline, gpc] = await Promise.all([retained("baseline"), retained("gpc")]);
    const assessment = buildGpcOptOutPrototype({ scanId: scan.id, baseline, gpc, observation, generatedAt: scan.gpc?.generatedAt });
    rows.push({ scanId: scan.id, domain: scan.domain, period: scan.period, originalStatus: scan.gpc?.status ?? "unavailable", sourceErrors, assessment });
  }
  const count = (predicate: (r: typeof rows[number]) => boolean) => rows.filter(predicate).length;
  const metric = (n: number) => ({ count: n, denominator: rows.length, percent: rows.length ? Number((100 * n / rows.length).toFixed(2)) : 0 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const implementationFiles = ["scripts/replay-gpc-opt-out-prototype.ts", "packages/certscore-contracts/src/gpc-opt-out-prototype.ts",
    "packages/certscore-contracts/src/gpc-observation.ts", "packages/certscore-contracts/src/index.ts",
    "packages/certscore-scan-core/src/gpc-opt-out-assessment.ts", "packages/certscore-scan-core/src/gpc-response-assessment.ts"];
  const implementationHashes = Object.fromEntries(await Promise.all(implementationFiles.map(async file =>
    [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
  const summary = {
    contractVersion: "certscore.gpc-opt-out-calibration.prototype.v1", mode: "internal_only", cohortSha256: createHash("sha256").update(await readFile(input.cohort)).digest("hex"),
    evaluatedAt: new Date().toISOString(), implementationHashes,
    cohortWindow: records.find(r => r.kind === "window") ?? null,
    upstreamExclusionSummary: records.filter(r => r.kind === "volume" && r.excludedErgo === true),
    excludedErgoveritas: records.filter(r => r.kind === "scan").length - scans.length,
    terminalScans: rows.length,
    originalDeterminateComparison: metric(count(r => ["responsive", "no_observable_response"].includes(r.originalStatus))),
    validGpcSource: metric(count(r => r.assessment.sources.some(s => s.kind === "runtime_bundle" && s.lane === "gpc_observation"))),
    httpTransmission: metric(count(r => r.assessment.delivery.http.status === "observed")),
    fullContextDelivery: metric(count(r => r.assessment.delivery.fullContext.status === "observed")),
    recordedSaleSharingState: metric(count(r => r.assessment.substantiveEvidence.registration)),
    optOutRecorded: metric(count(r => r.assessment.registration.status === "opt_out_recorded")),
    acknowledgmentObserved: metric(count(r => r.assessment.acknowledgment.status === "observed")),
    directRequestEvidence: metric(count(r => r.assessment.behavior.requestCount > 0)),
    directCollectionEvidence: metric(count(r => r.assessment.substantiveEvidence.collectionActivity)),
    substantiveEvidenceAvailable: metric(count(r => r.assessment.substantiveEvidence.registration || r.assessment.substantiveEvidence.collectionActivity)),
    comparisonComplete: metric(count(r => r.assessment.baselineComparison?.status !== "indeterminate" && r.assessment.baselineComparison !== null)),
    newlyAvailableCollectionEvidence: metric(count(r => r.assessment.substantiveEvidence.collectionActivity && r.originalStatus === "indeterminate")),
    release: { eligible: false, reasons: ["prototype_not_production_integrated", "fresh_adjudicated_public_calibration_required", "paired_latency_validation_required", "completion_target_requires_calibration"] },
    interpretation: "Transmission, acknowledgment and empty captures are not counted as substantive completion. Direct collection evidence is an observed fact, not proof that GPC was honored or ignored. Historical missing semantic evidence stays unknown.",
  };
  await writeFile(path.join(input.out, "assessments.json"), JSON.stringify(rows, null, 2) + "\n");
  await writeFile(path.join(input.out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i], value = process.argv[i + 1];
    if (!key || !value || !["--cohort", "--pairs", "--out", "--observations"].includes(key)) throw Error("Use --cohort FILE --pairs DIRECTORY --out NEW_DIRECTORY [--observations DIRECTORY]");
    args.set(key, value);
  }
  if (!args.has("--cohort") || !args.has("--pairs") || !args.has("--out")) throw Error("Explicit cohort, cached pairs and output directory are required");
  replayGpcOptOutPrototype({ cohort: args.get("--cohort")!, pairs: args.get("--pairs")!, out: args.get("--out")!, observations: args.get("--observations") })
    .then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
