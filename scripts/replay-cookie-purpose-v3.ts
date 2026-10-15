/** Read-only local replay. No scans, persistence, model calls or production writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { COOKIE_PURPOSE_POLICY, resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge } from "@certscore/vendor-resolver";
import { projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { resolveCanonicalActionStoragePurpose } from "../packages/certscore-vendor-resolver/src/action-storage-purpose";
import { buildPostRefusalRuntimeProjection } from "../apps/web/lib/scans/post-refusal-runtime-projection";
import { buildRuntimeCookieInventory } from "../apps/web/lib/scans/runtime-cookie-evidence";
import { buildNormalizedConcerns } from "../apps/web/lib/scans/normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../apps/web/lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "../apps/web/lib/scans/gdpr-eprivacy-coverage-checklist";
import { getGdprEprivacyRowDeduction } from "../apps/web/lib/scans/regulatory-coverage-score";

async function main() {
  const [inputDir, baselineFile, outputDir] = process.argv.slice(2);
  if (!inputDir || !baselineFile || !outputDir) throw new Error("Usage: tsx --tsconfig tsconfig.base.json scripts/replay-cookie-purpose-v3.ts RETAINED_DIR BASELINE_JSON OUTPUT_DIR");
  assert.notEqual(path.resolve(inputDir), path.resolve(outputDir));
  const require = createRequire(path.join(process.cwd(), "apps/web/package.json"));
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = { exports: {}, filename: serverOnlyPath, id: serverOnlyPath, loaded: true } as never;
  const { projectRetainedCookieObservations } = await import("../apps/web/server/scans/local-v2-dag-report");
  const baselines = JSON.parse(readFileSync(baselineFile, "utf8"));
  mkdirSync(outputDir, { recursive: true });
  const results = [];
  for (const baseline of baselines) {
    const file = path.join(inputDir, `${baseline.site}.json`);
    const bytes = readFileSync(file);
    const bundle = JSON.parse(bytes.toString());
    const hash = createHash("sha256").update(bytes).digest("hex");
    const candidate = structuredClone(bundle);
    const changes = [];
    for (const event of candidate.cookieEvents) {
      const context = { cookieDomain: event.cookieDomain ?? event.hostname, purposePolicyVersion: COOKIE_PURPOSE_POLICY };
      const proof = resolveCanonicalCookieClassification(event.cookieName, context);
      const knowledge = resolveCanonicalCookieKnowledge(event.cookieName, context);
      changes.push({ eventId: event.eventId, name: event.cookieName, domain: context.cookieDomain,
        before: { category: event.cookiePurpose, essentiality: event.cookieEssentiality }, after: proof });
      event.cookieClassification = proof;
      event.cookiePurpose = proof.category;
      event.cookieEssentiality = proof.essentiality;
      event.cookieEssentialityReasonCodes = [`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`];
      event.description = knowledge.description;
      event.dataTypes = knowledge.dataTypes;
    }
    const project = (source: typeof bundle) => {
      const observations = projectRetainedCookieObservations(source.cookieEvents, source.cookieSnapshots);
      const runtimeArtifacts = { hybridRuntimeEvidence: { cookieWriteObservations: observations } };
      const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
      const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
      const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, scanCompleted: true, coverageLimited: false, projectedFindings: [], unifiedFindings: [] });
      const row = checklist.find(row => row.id === "pre_consent_cookies_storage")!;
      return { deduction: getGdprEprivacyRowDeduction(row), storageChecklist: row, inventory: buildRuntimeCookieInventory({ runtimeArtifacts }) };
    };
    const metadataOnly = structuredClone(candidate);
    metadataOnly.cookieEvents.forEach((event: any, index: number) => {
      const original = bundle.cookieEvents[index];
      event.cookiePurpose = event.cookieClassification.category = original.cookiePurpose;
      event.cookieEssentiality = event.cookieClassification.essentiality = original.cookieEssentiality;
    });
    const before = project(bundle), providerOnly = project(metadataOnly), after = project(candidate);
    assert.equal(providerOnly.deduction, before.deduction, "Provider changes must be score-neutral");
    const actionChanges = [];
    for (const lane of ["postAcceptEvidence", "postRefusalEvidence"]) {
      const packet = candidate[lane];
      if (!packet) continue;
      for (const [collection, items] of Object.entries(packet.storage)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (item.storageType !== "cookie" || !item.hostname) continue;
          const next = resolveCanonicalActionStoragePurpose(item);
          if (item.purpose !== next.purpose || item.nonEssential !== next.nonEssential) actionChanges.push({ lane, collection,
            name: item.name, hostname: item.hostname, before: { purpose: item.purpose, nonEssential: item.nonEssential },
            after: { purpose: next.purpose, nonEssential: next.nonEssential } });
          Object.assign(item, next);
        }
      }
    }
    const projectReject = (packet: any) => {
      if (!packet) return { deduction: 0, status: "unavailable" };
      const runtimeArtifacts = buildPostRefusalRuntimeProjection(projectPostRefusalEvidenceForReport({ packet }));
      const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
      const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
      const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, scanCompleted: true, coverageLimited: false, projectedFindings: [], unifiedFindings: [] });
      const row = checklist.find(row => row.id === "post_reject_tracking_reduction")!;
      return { deduction: getGdprEprivacyRowDeduction(row), status: row.assessmentStatus };
    };
    const rejectBefore = projectReject(bundle.postRefusalEvidence), rejectAfter = projectReject(candidate.postRefusalEvidence);
    assert.equal(rejectAfter.deduction, rejectBefore.deduction, "Unexpected action-purpose impact needs independent scoring review");
    const publishedStorage = baseline.deductions.find((item: {family: string}) => item.family === "pre_consent_storage")?.points ?? 0;
    assert.equal(before.deduction, publishedStorage, `${baseline.site}: retained replay must reproduce published storage deduction`);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), bundle, "Source bundle mutated");
    const result = { site: baseline.site, scanId: bundle.scanId, sourceHash: hash, replayPolicy: COOKIE_PURPOSE_POLICY,
      publishedScore: baseline.score.value, oldStorageDeduction: before.deduction, newStorageDeduction: after.deduction,
      replayScore: baseline.score.value + before.deduction - after.deduction,
      scope: "Retained pre-consent cookie purposes replayed through materialization, normalized concern, concern policy, checklist and unchanged scoring. All other published deductions held fixed; not a fresh scan or full report regeneration.",
      actionChanges, rejectBefore, rejectAfter, providerOnlyDeduction: providerOnly.deduction,
      changes: changes.filter(row => row.before.category !== row.after.category || row.before.essentiality !== row.after.essentiality), before, after };
    writeFileSync(path.join(outputDir, `${baseline.site}-replay.json`), JSON.stringify(result, null, 2));
    results.push({ site: result.site, scanId: result.scanId, publishedScore: result.publishedScore,
      replayScore: result.replayScore, oldStorageDeduction: result.oldStorageDeduction, newStorageDeduction: result.newStorageDeduction,
      changedCookieObservations: result.changes.length, changedActionRows: actionChanges.length,
      oldRejectDeduction: rejectBefore.deduction, newRejectDeduction: rejectAfter.deduction, providerOnlyDeduction: providerOnly.deduction, sourceHash: hash });
  }
  writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
