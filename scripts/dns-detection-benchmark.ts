import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export type Detection = "positive" | "negative" | "unknown" | "limited";
export type Truth = "present" | "absent" | "unknown";

export interface EvidencePacket {
  packetId: string;
  siteKey: string;
  capture: "complete" | "limited" | "failed";
  evidence: Array<{ evidenceId: string; kind: string; excerpt: string; source: string }>;
}

export interface PredictionRecord { packetId: string; prediction: Detection }

export interface HumanLabel {
  siteKey: string;
  truth: Truth;
  reviewer: string;
  evidenceOnlyAttested: true;
  evidencePacketSetSha256: string;
  evidenceRefs: string[];
  rationale: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function evidencePacketSetHashes(packets: EvidencePacket[]): Record<string, string> {
  const grouped = new Map<string, EvidencePacket[]>();
  for (const packet of packets) grouped.set(packet.siteKey, [...(grouped.get(packet.siteKey) ?? []), packet]);
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([siteKey, rows]) => [
    siteKey,
    createHash("sha256").update(JSON.stringify(rows.slice().sort((a, b) => a.packetId.localeCompare(b.packetId)).map(canonicalize))).digest("hex"),
  ]));
}

export function evaluateBenchmark(packets: EvidencePacket[], predictions: PredictionRecord[], labels: HumanLabel[], minCaptureCoverage = 0.95) {
  if (!(minCaptureCoverage >= 0 && minCaptureCoverage <= 1)) throw new Error("Minimum capture coverage must be between 0 and 1");
  const packetHashes = evidencePacketSetHashes(packets);
  const labelBySite = new Map<string, HumanLabel>();
  for (const label of labels) {
    if (labelBySite.has(label.siteKey)) throw new Error(`Duplicate human label for site ${label.siteKey}`);
    if (!label.reviewer.trim() || !label.rationale.trim() || label.evidenceOnlyAttested !== true || label.evidenceRefs.length === 0) {
      throw new Error(`Incomplete evidence-only human label for site ${label.siteKey}`);
    }
    if (label.evidencePacketSetSha256 !== packetHashes[label.siteKey]) throw new Error(`Evidence packet hash mismatch for site ${label.siteKey}`);
    labelBySite.set(label.siteKey, label);
  }

  const packetsBySite = new Map<string, EvidencePacket[]>();
  const packetIds = new Set<string>();
  const predictionByPacket = new Map<string, Detection>();
  for (const record of predictions) {
    if (predictionByPacket.has(record.packetId)) throw new Error(`Duplicate prediction for packet ${record.packetId}`);
    predictionByPacket.set(record.packetId, record.prediction);
  }
  for (const packet of packets) {
    if (packetIds.has(packet.packetId)) throw new Error(`Duplicate evidence packet ${packet.packetId}`);
    packetIds.add(packet.packetId);
    const list = packetsBySite.get(packet.siteKey) ?? [];
    list.push(packet);
    packetsBySite.set(packet.siteKey, list);
  }
  for (const record of predictions) if (!packetIds.has(record.packetId)) throw new Error(`Prediction references unknown packet ${record.packetId}`);
  for (const label of labels) {
    const sitePackets = packetsBySite.get(label.siteKey);
    if (!sitePackets) throw new Error(`Human label references unknown site ${label.siteKey}`);
    const evidenceIds = new Set(sitePackets.flatMap((packet) => packet.evidence.map((item) => item.evidenceId)));
    if (!label.evidenceRefs.every((id) => evidenceIds.has(id))) throw new Error(`Human label for ${label.siteKey} references evidence outside its reviewer packet`);
  }

  let tp = 0, fp = 0, fn = 0, tn = 0, abstainedPresent = 0, abstainedAbsent = 0;
  let adjudicatedSites = 0, unresolvedSites = 0, unlabeledSites = 0;
  for (const [siteKey, sitePackets] of packetsBySite) {
    const label = labelBySite.get(siteKey);
    if (!label) { unlabeledSites++; continue; }
    if (label.truth === "unknown") { unresolvedSites++; continue; }
    const complete = sitePackets.filter((packet) => packet.capture === "complete");
    // A site-level positive is supported by any complete positive visit. A negative
    // requires complete negative visits and no positive visit; otherwise it is unknown.
    const prediction: Detection = sitePackets.some((packet) => predictionByPacket.get(packet.packetId) === "positive" && packet.capture === "complete")
      ? "positive"
      : complete.length > 0 && complete.every((packet) => predictionByPacket.get(packet.packetId) === "negative")
        ? "negative"
        : "unknown";
    adjudicatedSites++;
    if (label.truth === "present") {
      if (prediction === "positive") tp++;
      else {
        fn++;
        if (prediction === "unknown") abstainedPresent++;
      }
    } else {
      if (prediction === "positive") fp++;
      else if (prediction === "negative") tn++;
      else abstainedAbsent++;
    }
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall);
  const completeCaptureSites = [...packetsBySite.values()].filter((sitePackets) => sitePackets.some((packet) => packet.capture === "complete")).length;
  const captureCoverage = packetsBySite.size === 0 ? null : completeCaptureSites / packetsBySite.size;
  const humanLabelCoverage = packetsBySite.size === 0 ? null : (packetsBySite.size - unlabeledSites) / packetsBySite.size;
  const gateBlockers = [
    ...(unlabeledSites > 0 ? [`${unlabeledSites} site(s) lack human labels`] : []),
    ...(unresolvedSites > 0 ? [`${unresolvedSites} site(s) have unresolved human labels`] : []),
    ...(captureCoverage === null || captureCoverage < minCaptureCoverage ? [`capture coverage is below ${minCaptureCoverage}`] : []),
    ...(adjudicatedSites === 0 ? ["no resolved, human-labeled sites"] : []),
    ...(precision === null ? ["precision denominator is empty"] : []),
    ...(recall === null ? ["recall denominator is empty"] : []),
    ...(precision !== null && precision < 0.95 ? ["precision is below 0.95"] : []),
    ...(recall !== null && recall < 0.9 ? ["recall is below 0.90"] : []),
  ];
  return {
    unit: "unique_site",
    sites: packetsBySite.size,
    adjudicatedSites,
    unresolvedSites,
    unlabeledSites,
    humanLabelCoverage,
    completeCaptureSites,
    captureCoverage,
    abstentions: { presentSites: abstainedPresent, absentSites: abstainedAbsent },
    confusion: { truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn },
    precision,
    recall,
    f1,
    denominatorNotes: {
      precision: "TP / (TP + FP), among human-labeled unique sites with positive detection",
      recall: "TP / (TP + FN), among human-labeled unique sites labeled present; unknown/limited predictions count as false negatives",
      abstentions: "Unknown/limited predictions on human-absent sites are reported separately and excluded from TN",
      captureCoverage: "Unique sites with at least one complete capture / all unique sites",
      unresolved: "Unknown labels and sites without complete capture are reported separately and do not become absence labels",
    },
    releaseGate: { minimumCaptureCoverage: minCaptureCoverage, minimumPrecision: 0.95, minimumRecall: 0.9, passed: gateBlockers.length === 0, blockers: gateBlockers },
  };
}

function parseJsonl<T>(content: string, file: string): T[] {
  return content.split(/\r?\n/).map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line && !line.startsWith("#"))
    .map(({ line, index }) => {
      try { return JSON.parse(line) as T; }
      catch { throw new Error(`${file}:${index + 1}: invalid JSON`); }
    });
}

async function main() {
  if (process.argv[2] === "--hashes") {
    const sourcePath = process.argv[3];
    if (!sourcePath) throw new Error("Usage: node --import tsx scripts/dns-detection-benchmark.ts --hashes <evidence-only-packets.jsonl>");
    const content = await readFile(sourcePath, "utf8");
    console.log(JSON.stringify(evidencePacketSetHashes(parseJsonl<EvidencePacket>(content, sourcePath)), null, 2));
    return;
  }
  const packetPath = process.argv[2];
  if (!packetPath || !process.argv[3] || !process.argv[4]) {
    console.error("Usage: node --import tsx scripts/dns-detection-benchmark.ts <evidence-only-packets.jsonl> <predictions.jsonl> <human-labels.jsonl>");
    process.exitCode = 2;
    return;
  }
  const predictionPath = process.argv[3];
  const labelsPath = process.argv[4];
  if (!predictionPath || !labelsPath) throw new Error("Predictions and human-labels inputs are required");
  const [packetText, predictionText, labelText] = await Promise.all([readFile(packetPath, "utf8"), readFile(predictionPath, "utf8"), readFile(labelsPath, "utf8")]);
  const minimumCaptureCoverage = process.argv[5] === "--min-capture-coverage" ? Number(process.argv[6]) : 0.95;
  const result = evaluateBenchmark(parseJsonl<EvidencePacket>(packetText, packetPath), parseJsonl<PredictionRecord>(predictionText, predictionPath), parseJsonl<HumanLabel>(labelText, labelsPath), minimumCaptureCoverage);
  console.log(JSON.stringify(result, null, 2));
  if (!result.releaseGate.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("dns-detection-benchmark.ts")) void main();
