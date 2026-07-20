import { createRequire } from "node:module";
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") files.push(target);
  }
  return files.sort();
}

function host(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
}

function loadServerModules() {
  const require = createRequire(import.meta.url);
  const Module = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = Module._load;
  Module._load = function loadWithServerOnlyShim(request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  return import("../apps/web/server/scans/local-v2-dag-report.ts").then(async (localModule) => {
    const projectionModule = await import("../apps/web/lib/pulse/projection.ts");
    Module._load = originalLoad;
    return {
      materializeLocalV2DagScanDetail: localModule.materializeLocalV2DagScanDetail,
      buildPulseProjection: projectionModule.buildPulseProjection,
    };
  }).catch((error) => {
    Module._load = originalLoad;
    throw error;
  });
}

function scanRecord(bundle: JsonObject, outDir: string, index: number, regionOverride: string | null): JsonObject {
  const url = typeof bundle.url === "string" ? bundle.url : "https://unknown.invalid/";
  const domainHostname = host(url);
  const scanId = typeof bundle.scanId === "string" ? bundle.scanId : `retained-passive-${index}`;
  return {
    events: [], pageEvidence: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [],
    primaryPolicyEnrichment: null, runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [],
    validationFindings: [], accessPostureSummary: {}, domainBenchmark: null,
    scan: {
      completedAt: bundle.completedAt ?? new Date().toISOString(),
      createdAt: bundle.startedAt ?? new Date().toISOString(),
      displayCreatedAt: bundle.startedAt ?? new Date().toISOString(),
      displayStatus: "completed", domainHostname, domainId: null, errorMessage: null,
      executionSummary: null, id: scanId, pagesRequested: 1, pagesScanned: 1,
      scanConfigJson: {
        hostname: domainHostname, normalizedUrl: url, processor: "local-certscore-v2-dag-parallel-v1",
        execution: {
          v2DagParallel: { artifactOnly: true, localOnly: true, profile: "standard", productionFindingIntegration: false },
          localV2Dag: { outDir }
        }
      },
      scanFromLabel: "Local retained passive replay", scanFromValue: "local",
      scanType: "full", startedAt: bundle.startedAt ?? new Date().toISOString(), status: "completed",
      provenance: { lambdaAwsRegion: regionOverride ?? (bundle.region as string | null) ?? "unknown", requestedScanFromValue: "cloud" }
    }
  };
}

async function main() {
  const input = path.resolve(process.argv[process.argv.indexOf("--input") + 1] ?? "artifacts/v2-scan-quality-calibration/consent-retention-06d7e04f-20260718/passive");
  const out = path.resolve(process.argv[process.argv.indexOf("--out") + 1] ?? "artifacts/gdpr-transparency-post-projection-sample");
  const regionMapPath = process.argv.indexOf("--region-map") >= 0 ? process.argv[process.argv.indexOf("--region-map") + 1] : null;
  const regionMap = regionMapPath ? JSON.parse(await readFile(path.resolve(regionMapPath), "utf8")) as Record<string, string> : {};
  process.env.NODE_ENV = "development";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const { materializeLocalV2DagScanDetail, buildPulseProjection } = await loadServerModules();
  const bundlePaths = await walk(input);
  await mkdir(out, { recursive: true });
  const mirrorRoot = path.resolve(`artifacts/local-v2-dag-scans/gdpr-transparency-post-projection-input-${path.basename(input)}`);
  await mkdir(mirrorRoot, { recursive: true });
  let written = 0;
  for (let index = 0; index < bundlePaths.length; index += 1) {
    const bundlePath = bundlePaths[index]!;
    const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as JsonObject;
    const localOutDir = path.dirname(bundlePath);
    const mirrorDir = path.join(mirrorRoot, String(index).padStart(3, "0"));
    try { await symlink(localOutDir, mirrorDir, "dir"); } catch { /* Existing deterministic mirror is safe to reuse. */ }
    const region = regionMap[typeof bundle.scanId === "string" ? bundle.scanId : ""] ??
      regionMap[typeof bundle.url === "string" ? bundle.url : ""] ?? null;
    const sourceRecord = scanRecord(bundle, mirrorDir, index, region);
    const detail = await materializeLocalV2DagScanDetail(sourceRecord as never);
    const projection = buildPulseProjection({
      detail: "evidence", format: "json", freshnessMode: "latest", pulseRequestId: `retained-passive:${index}`,
      requestedUrl: typeof bundle.url === "string" ? bundle.url : null, resolutionMode: "retained_passive_replay",
      scanRecord: detail, waitSeconds: 0
    });
    const scanId = typeof bundle.scanId === "string" ? bundle.scanId : `retained-passive-${index}`;
    await writeFile(path.join(out, `${scanId}.json`), `${JSON.stringify(projection, null, 2)}\n`);
    const screenshotSource = path.join(localOutDir, "auxiliary", "screenshot-pre-consent.png");
    try { await symlink(screenshotSource, path.join(out, `${scanId}.png`), "file"); } catch { /* Screenshot is optional for JSON-only retained rows. */ }
    written += 1;
  }
  await writeFile(path.join(out, "README.json"), `${JSON.stringify({
    purpose: "Offline post-projection sample generated by replaying retained passive bundles through WC01 materialization and public projection.",
    input, written, liveTraffic: false, consentControlsClicked: false,
    productionIntegration: false,
    regionProvenance: `Copied from the supplied region map when present, otherwise CanonicalEvidenceBundle.region; missing values remain unknown. Regions in this sample: ${[...new Set(Object.values(regionMap))].sort().join(", ") || "bundle_only"}.`
  }, null, 2)}\n`);
  console.log(JSON.stringify({ out, input, written, liveTraffic: false }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
