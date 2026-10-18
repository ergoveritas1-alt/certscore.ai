import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gpcResponseAssessmentSchema } from "../packages/certscore-contracts/src/index";
import { buildGpcProductionAssessment } from "../packages/certscore-scan-core/src/gpc-production-observation";
import { deriveCaliforniaGpcResponsePolicy } from "../apps/web/lib/scans/california-gpc-response-policy";
import { buildUnifiedFindingDisplayPackets } from "../apps/web/lib/scans/unified-findings";
import { CALIFORNIA_SCORING_POLICY_VERSION } from "../apps/web/lib/scans/scoring-policy";
import { deriveCaliforniaRegulatoryScore } from "../apps/web/lib/scans/california-regulatory-score";

// Offline diagnostic replay only. Never contacts a target, invokes a model,
// changes source artifacts, or publishes/replaces a stored report.
async function main() {
  const root = path.resolve(process.argv[2] ?? "artifacts/local-v2-dag-lambda-simulated");
  const output = path.resolve(process.argv[3] ?? "artifacts/california-recipient-policy-2026-10-17/Calibration.json");
  const candidates: Array<{ directory: string; scanId: string; host: string; at: string }> = [];
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    try {
      const manifest = JSON.parse(await readFile(path.join(root, directory.name, "LocalV2DagLambdaManifest.json"), "utf8"));
      const host = new URL(manifest.targetUrl).hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost") || host.endsWith(".test") || host.endsWith(".invalid") || !host.includes(".")) continue;
      candidates.push({ directory: directory.name, scanId: manifest.scanId, host, at: manifest.generatedAt });
    } catch { /* Missing or unusable metadata is not a calibration case. */ }
  }
  candidates.sort((a,b) => b.at.localeCompare(a.at));
  const hosts = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let rejectedArtifacts = 0;
  for (const candidate of candidates) {
    if (hosts.has(candidate.host) || rows.length >= 20) continue;
    try {
      const directory = path.join(root, candidate.directory);
      const bundle = JSON.parse(await readFile(path.join(directory, "CanonicalEvidenceBundle.json"), "utf8"));
      const original = gpcResponseAssessmentSchema.parse(bundle.gpcResponseAssessment);
      if (original.contractVersion !== "certscore.gpc-response-assessment.v3" || !original.comparison.gpcArtifact) continue;
      const bytes = await readFile(path.join(directory, "lanes/gpc_observation/CanonicalEvidenceBundle.json"));
      const { observation: _previousObservation, ...comparison } = original;
      const assessment = buildGpcProductionAssessment({ scanId: candidate.scanId,
        comparison: { ...comparison, contractVersion: "certscore.gpc-response-assessment.v2" },
        source: { bytes, pointer: original.comparison.gpcArtifact } });
      const policy = deriveCaliforniaGpcResponsePolicy(assessment);
      const recipients = [...new Map(assessment.observation.requests.advertisingCollectionRecipients?.rows.map(row => [row.entityId, row.label]) ?? []).entries()]
        .map(([entityId, label]) => ({ entityId, label }));
      const row: Record<string, unknown> = { ...candidate, observationStatus: assessment.observation.status,
        comparisonStatus: assessment.status, collectionRequests: assessment.observation.requests.advertisingCollectionCount,
        recipients, previousFlatPoints: policy.scoreEffect === "deduction" ? 15 : 0, points: policy.deductionPoints,
        reason: policy.reasonCode, sourceSha256: assessment.observation.sourceSha256 };
      // Existing real report supplies only its persisted typed assessment; the
      // new observation still passes through concern policy and unified findings.
      if (candidate.scanId === "cabd940b-5114-47e8-a331-9630a6e807a8") {
        const retained = JSON.parse(await readFile("artifacts/msnbc-5s-verified-2026-10-17/Report.json", "utf8"));
        const parent = retained.consentControlAssessment;
        const findings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
          runtimeArtifacts: { consentControlAssessment: parent, gpcResponseAssessment: assessment } });
        row.californiaScore = deriveCaliforniaRegulatoryScore({ assessment: parent.californiaPrivacyReview, checklistRows: [], unifiedFindings: findings });
      }
      rows.push(row); hosts.add(candidate.host);
    } catch { rejectedArtifacts++; }
  }
  const result = { policy: CALIFORNIA_SCORING_POLICY_VERSION, schedule: [0,15,25,32,37,40,43,45,47], cap:47,
    scope:"Offline retained-evidence replay; latest usable v3 case per host, up to 20 hosts. This is not independent legal adjudication or a representative accuracy estimate.",
    generatedAt: new Date().toISOString(), rejectedArtifacts, cases: rows };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ output, rejectedArtifacts, cases: rows.map(({host,collectionRequests,recipients,points,californiaScore}) =>
    ({host,collectionRequests,recipients,points,score: (californiaScore as {score?:number}|undefined)?.score})) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
