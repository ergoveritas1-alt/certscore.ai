#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle } from "../packages/certscore-contracts/src/index.js";
import {
  buildEndpointEnrichmentOverlay,
  collectEndpointEnrichmentCandidatesFromBundle,
  createEmptyEndpointEnrichmentRegistry,
  updateEndpointEnrichmentRegistry,
  type EndpointEnrichmentRegistry,
} from "../packages/certscore-vendor-resolver/src/endpoint-enrichment-registry.js";

type Args = {
  artifactRoots: string[];
  bundles: string[];
  dryRun: boolean;
  enableDnsCname: boolean;
  help?: boolean;
  maxHosts?: number;
  out?: string;
  registryPath: string;
  timeoutMs?: number;
  writeOverlays: boolean;
};

type EndpointRegistryRunReport = {
  generatedAt: string;
  input: {
    artifactRoots: string[];
    bundles: string[];
    dryRun: boolean;
    enableDnsCname: boolean;
    maxHosts?: number;
    registryPath: string;
    timeoutMs?: number;
    writeOverlays: boolean;
  };
  summary: {
    bundleCount: number;
    candidatesObserved: number;
    entriesAfter: number;
    entriesBefore: number;
    enrichedRegionObserved: number;
    enrichmentFailures: number;
    newEntries: number;
    overlayArtifactsWritten: number;
    unknownAfterEnrichment: number;
    updatedEntries: number;
  };
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const bundlePaths = uniqueStrings([
    ...args.bundles,
    ...((await Promise.all(args.artifactRoots.map(findCanonicalBundlePaths))).flat()),
  ]);
  const bundles = await Promise.all(bundlePaths.map(readBundle));
  const candidates = bundles.flatMap(collectEndpointEnrichmentCandidatesFromBundle);
  const registry = await readRegistry(args.registryPath);
  const update = await updateEndpointEnrichmentRegistry(registry, candidates, {
    enableDnsCname: args.enableDnsCname,
    maxHosts: args.maxHosts,
    timeoutMs: args.timeoutMs,
  });
  const overlayWrites = args.writeOverlays
    ? bundlePaths.map((bundlePath, index) => ({
      bundlePath,
      overlay: buildEndpointEnrichmentOverlay(bundles[index]!, update.registry),
      overlayPath: path.join(path.dirname(bundlePath), "EndpointEnrichmentOverlay.json"),
    }))
    : [];

  const report: EndpointRegistryRunReport = {
    generatedAt: new Date().toISOString(),
    input: {
      artifactRoots: args.artifactRoots,
      bundles: args.bundles,
      dryRun: args.dryRun,
      enableDnsCname: args.enableDnsCname,
      maxHosts: args.maxHosts,
      registryPath: args.registryPath,
      timeoutMs: args.timeoutMs,
      writeOverlays: args.writeOverlays,
    },
    summary: {
      bundleCount: bundles.length,
      ...update.report,
      overlayArtifactsWritten: overlayWrites.length,
    },
  };

  const out = args.out ?? path.join(path.dirname(args.registryPath), "EndpointEnrichmentRegistryRunReport.json");
  if (!args.dryRun) {
    await mkdir(path.dirname(args.registryPath), { recursive: true });
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(args.registryPath, `${JSON.stringify(update.registry, null, 2)}\n`);
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
    for (const item of overlayWrites) {
      await writeFile(item.overlayPath, `${JSON.stringify(item.overlay, null, 2)}\n`);
    }
  }

  console.log(`Bundles inspected: ${report.summary.bundleCount}`);
  console.log(`Endpoint candidates observed: ${report.summary.candidatesObserved}`);
  console.log(`Registry entries: ${report.summary.entriesBefore} -> ${report.summary.entriesAfter}`);
  console.log(`Region-observed entries: ${report.summary.enrichedRegionObserved}`);
  console.log(`Unknown after enrichment: ${report.summary.unknownAfterEnrichment}`);
  console.log(`Enrichment failures: ${report.summary.enrichmentFailures}`);
  console.log(`Endpoint overlays written: ${report.summary.overlayArtifactsWritten}`);
  if (args.dryRun) {
    console.log("Dry run only; registry not written.");
  } else {
    console.log(`Wrote ${args.registryPath}`);
    console.log(`Wrote ${out}`);
    if (overlayWrites.length > 0) {
      console.log(`Wrote ${overlayWrites.length} EndpointEnrichmentOverlay.json artifact(s)`);
    }
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactRoots: [],
    bundles: [],
    dryRun: false,
    enableDnsCname: true,
    registryPath: path.join("artifacts", "v2-endpoint-enrichment-registry", "EndpointEnrichmentRegistry.json"),
    writeOverlays: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--help" || key === "-h") {
      args.help = true;
    } else if ((key === "--artifact-root" || key === "--artifact-dir") && value) {
      args.artifactRoots.push(value);
      index += 1;
    } else if (key === "--bundle" && value) {
      args.bundles.push(value);
      index += 1;
    } else if (key === "--registry" && value) {
      args.registryPath = value;
      index += 1;
    } else if (key === "--out" && value) {
      args.out = value;
      index += 1;
    } else if (key === "--max-hosts" && value) {
      args.maxHosts = Number(value);
      index += 1;
    } else if (key === "--timeout-ms" && value) {
      args.timeoutMs = Number(value);
      index += 1;
    } else if (key === "--no-dns") {
      args.enableDnsCname = false;
    } else if (key === "--dry-run") {
      args.dryRun = true;
    } else if (key === "--write-overlays") {
      args.writeOverlays = true;
    }
  }

  if (args.artifactRoots.length === 0 && args.bundles.length === 0) {
    args.artifactRoots.push("artifacts");
  }

  return args;
}

function usage(): string {
  return [
    "Usage: pnpm v2:endpoint-enrichment-registry [--artifact-root artifacts/v2-calibration] [--bundle path/CanonicalEvidenceBundle.json]",
    "",
    "Maintains an internal host-only endpoint enrichment registry from saved v2 artifacts.",
    "This does not run in scan-core and does not write production report output.",
    "",
    "Options:",
    "  --registry <path>      Registry JSON path. Defaults to artifacts/v2-endpoint-enrichment-registry/EndpointEnrichmentRegistry.json",
    "  --out <path>           Run report JSON path.",
    "  --no-dns               Do not resolve CNAME chains; only parse observed hostnames.",
    "  --timeout-ms <n>       Per-CNAME lookup timeout. Defaults to registry module default.",
    "  --max-hosts <n>        Cap candidate hosts processed in this run.",
    "  --dry-run              Print summary without writing files.",
    "  --write-overlays       Write EndpointEnrichmentOverlay.json next to each inspected bundle.",
  ].join("\n");
}

async function readRegistry(registryPath: string): Promise<EndpointEnrichmentRegistry> {
  if (!existsSync(registryPath)) {
    return createEmptyEndpointEnrichmentRegistry();
  }
  const raw = JSON.parse(await readFile(registryPath, "utf8")) as EndpointEnrichmentRegistry;
  if (raw.registryVersion !== "certscore.endpoint_enrichment_registry.1" || !Array.isArray(raw.entries)) {
    throw new Error(`Unsupported endpoint enrichment registry at ${registryPath}`);
  }
  return raw;
}

async function readBundle(filePath: string): Promise<CanonicalEvidenceBundle> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return canonicalEvidenceBundleSchema.parse(raw);
}

async function findCanonicalBundlePaths(root: string): Promise<string[]> {
  if (!existsSync(root)) {
    return [];
  }
  const statEntries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(statEntries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return findCanonicalBundlePaths(fullPath);
    }
    return entry.isFile() && entry.name === "CanonicalEvidenceBundle.json" ? [fullPath] : [];
  }));
  return paths.flat();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
