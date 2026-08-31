import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  buildCanonicalPostRefusalActionRecipes,
  CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
  captureConsentControlGeometry,
  chromiumContextOptions,
  chromiumLaunchOptions,
  installPublicNetworkGuardRoute,
  runPostRefusalObserver,
} from "../packages/certscore-scan-core/src/index.js";

const DEFAULT_SELECTION = path.resolve(
  "artifacts/scan-quality-calibration/2026-08-30-reject-path-50/RejectPath50Selection.json",
);
const REJECT_LANE_PASSIVE_STAGGER_MS = 500;

type SelectedTarget = {
  exactTargetUrl: string;
  normalizedDomain: string;
  sourceOutcome?: string;
  sourceScanId?: string;
  scanId?: string;
};

type Args = {
  actionSearchTimeoutMs: number;
  concurrency: number;
  confirmationTimeoutMs: number;
  domains: Set<string>;
  execute: boolean;
  limit: number;
  observationWindowMs: number;
  offset: number;
  outDir: string;
  passiveWaitMs: number;
  runKey: string;
  selectionPath: string;
  withPassiveCheck: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    actionSearchTimeoutMs: 10_000,
    concurrency: 2,
    confirmationTimeoutMs: 2_000,
    domains: new Set(),
    execute: false,
    limit: 50,
    observationWindowMs: 500,
    offset: 0,
    outDir: path.resolve("artifacts/scan-quality-calibration/2026-08-30-reject-path-50/local-runs"),
    passiveWaitMs: 8_000,
    runKey: `local-ie-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    selectionPath: DEFAULT_SELECTION,
    withPassiveCheck: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--execute") {
      args.execute = true;
      continue;
    }
    if (arg === "--with-passive-check") {
      args.withPassiveCheck = true;
      continue;
    }
    const value = argv[++index];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--action-search-timeout-ms") args.actionSearchTimeoutMs = Number(value);
    else if (arg === "--concurrency") args.concurrency = Number(value);
    else if (arg === "--confirmation-timeout-ms") args.confirmationTimeoutMs = Number(value);
    else if (arg === "--domains") {
      args.domains = new Set(value.split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean));
    } else if (arg === "--limit") args.limit = Number(value);
    else if (arg === "--observation-window-ms") args.observationWindowMs = Number(value);
    else if (arg === "--offset") args.offset = Number(value);
    else if (arg === "--out-dir") args.outDir = path.resolve(value);
    else if (arg === "--passive-wait-ms") args.passiveWaitMs = Number(value);
    else if (arg === "--run-key") args.runKey = value;
    else if (arg === "--selection") args.selectionPath = path.resolve(value);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 4) {
    throw new Error("--concurrency must be an integer from 1 through 4");
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) {
    throw new Error("--limit must be an integer from 1 through 200");
  }
  if (!Number.isInteger(args.offset) || args.offset < 0 || args.offset > 10_000) {
    throw new Error("--offset must be an integer from 0 through 10000");
  }
  if (!Number.isFinite(args.actionSearchTimeoutMs) || args.actionSearchTimeoutMs < 0 || args.actionSearchTimeoutMs > 10_000) {
    throw new Error("--action-search-timeout-ms must be 0-10000");
  }
  if (!Number.isFinite(args.confirmationTimeoutMs) || args.confirmationTimeoutMs < 50 || args.confirmationTimeoutMs > 5_000) {
    throw new Error("--confirmation-timeout-ms must be 50-5000");
  }
  if (!Number.isFinite(args.observationWindowMs) || args.observationWindowMs < 0 || args.observationWindowMs > 30_000) {
    throw new Error("--observation-window-ms must be 0-30000");
  }
  if (!Number.isFinite(args.passiveWaitMs) || args.passiveWaitMs < 0 || args.passiveWaitMs > 15_000) {
    throw new Error("--passive-wait-ms must be 0-15000");
  }
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(args.runKey)) throw new Error("--run-key is invalid");
  return args;
}

async function capturePassiveRejectState(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
  waitMs: number,
  outDir: string,
) {
  const context = await browser.newContext(chromiumContextOptions());
  try {
    await installPublicNetworkGuardRoute(context);
    const page = await context.newPage();
    let navigationError: string | undefined;
    await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" }).catch((error: unknown) => {
      navigationError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    });
    if (page.url() === "about:blank") {
      return { cmp: null, error: navigationError ?? "no_document_committed", rejectState: "unknown" as const };
    }
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const geometry = await captureConsentControlGeometry(page, {
      candidateLimit: 48,
      containerLimit: 16,
      timeoutMs: 1_000,
    });
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, "PassiveConsentControlGeometry.json"),
      `${JSON.stringify(geometry, null, 2)}\n`,
    );
    const rejectObserved = geometry.candidates.some((candidate) =>
      candidate.actionType === "reject_all" &&
      candidate.decisionStatus === "confirmed_visible" &&
      candidate.layer === "first_layer" &&
      candidate.enabled &&
      candidate.intersectsViewport &&
      candidate.classifierConfidence >= 0.8 &&
      (candidate.consentContextConfirmed || geometry.cmp.detected)
    );
    return {
      cmp: geometry.cmp.name ?? null,
      finalUrl: page.url(),
      rejectState: rejectObserved ? "observed" as const : "not_observed" as const,
      summary: geometry.summary,
    };
  } catch (error) {
    return {
      cmp: null,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      rejectState: "unknown" as const,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function outcome(packet: Awaited<ReturnType<typeof runPostRefusalObserver>>) {
  if (
    packet.productionProjectable &&
    packet.refusalRegistration.status === "confirmed" &&
    packet.refusalRegistration.refusalExercised
  ) return "confirmed";
  return packet.refusalRegistration.reason ?? packet.resolver.reason ?? packet.refusalRegistration.status;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await task(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selection = JSON.parse(await readFile(args.selectionPath, "utf8")) as {
    selected: SelectedTarget[];
  };
  const filtered = args.domains.size > 0
    ? selection.selected.filter((target) => args.domains.has(target.normalizedDomain.toLowerCase()))
    : selection.selected.slice(args.offset, args.offset + args.limit);
  if (filtered.length === 0) throw new Error("No selected targets matched the requested local run.");
  if (args.domains.size > 0) {
    const found = new Set(filtered.map((target) => target.normalizedDomain.toLowerCase()));
    const missing = [...args.domains].filter((domain) => !found.has(domain));
    if (missing.length > 0) {
      throw new Error(`Selection is missing requested domains: ${missing.join(", ")}`);
    }
  }

  const runDir = path.join(args.outDir, args.runKey);
  await mkdir(runDir, { recursive: true });
  const resultsPath = path.join(runDir, "LocalRejectPathResults.json");
  const existing = await readFile(resultsPath, "utf8")
    .then((value) => JSON.parse(value) as { results?: unknown[] })
    .catch(() => undefined);
  if ((existing?.results?.length ?? 0) > 0) {
    throw new Error(`Run ${args.runKey} already has results; use a new --run-key.`);
  }

  console.log(JSON.stringify({
    actionSearchTimeoutMs: args.actionSearchTimeoutMs,
    confirmationTimeoutMs: args.confirmationTimeoutMs,
    contactCount: filtered.length,
    locale: process.env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE ?? null,
    observationWindowMs: args.observationWindowMs,
    passiveWaitMs: args.withPassiveCheck ? args.passiveWaitMs : null,
    runDir,
    timezone: process.env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID ?? null,
  }, null, 2));
  if (!args.execute) return;

  const recipes = buildCanonicalPostRefusalActionRecipes();
  if (recipes.length === 0) throw new Error("Canonical Reject recipe registry is empty.");
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    const completed: Array<Record<string, unknown>> = [];
    const results = await mapConcurrent(filtered, args.concurrency, async (target, index) => {
      const scanId = `local-reject-${args.runKey}-${randomUUID()}`.slice(0, 160);
      const startedAt = new Date().toISOString();
      const targetDir = path.join(runDir, `${String(index + 1).padStart(2, "0")}-${target.normalizedDomain}`);
      try {
        const passiveCheck = args.withPassiveCheck
          ? capturePassiveRejectState(browser, target.exactTargetUrl, args.passiveWaitMs, targetDir)
          : Promise.resolve(undefined);
        if (args.withPassiveCheck) {
          await new Promise<void>((resolve) => setTimeout(resolve, REJECT_LANE_PASSIVE_STAGGER_MS));
        }
        const packet = await runPostRefusalObserver({
          actionSearchTimeoutMs: args.actionSearchTimeoutMs,
          allowCanonicalRejectDiscovery: true,
          browser,
          confirmationTimeoutMs: args.confirmationTimeoutMs,
          interactionAuthorization: {
            authorizationId: "sharded_scan_resolved_exact_target.v2",
            kind: "scan_target_resolution",
            maxRedirects: 8,
            requestedUrl: target.exactTargetUrl,
            resolutionTimeoutMs: 5_000,
            scanId,
          },
          normalizedUrl: target.exactTargetUrl,
          observationWindowMs: args.observationWindowMs,
          outDir: targetDir,
          productionProjectable: true,
          recipe: recipes[0]!,
          recipeCandidates: recipes,
          recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
          retainResolverDiagnostics: true,
          scanId,
          url: target.exactTargetUrl,
        });
        const passive = await passiveCheck;
        const result = {
          click: packet.interactionDiagnostics?.click ?? null,
          completedAt: new Date().toISOString(),
          domain: target.normalizedDomain,
          exactTargetUrl: target.exactTargetUrl,
          navigation: packet.interactionDiagnostics?.navigation ?? null,
          outcome: outcome(packet),
          passive: passive ?? null,
          productionProjectable: packet.productionProjectable,
          resolver: packet.resolver,
          scanId,
          sourceOutcome: target.sourceOutcome,
          sourceScanId: target.sourceScanId ?? target.scanId,
          startedAt,
          timing: packet.timing,
        };
        console.log(`[${index + 1}/${filtered.length}] ${target.normalizedDomain}: ${result.outcome}`);
        completed.push(result);
        await writeFile(resultsPath, `${JSON.stringify({
          artifactVersion: "certscore.local_reject_path_results.v1",
          generatedAt: new Date().toISOString(),
          results: completed,
          runKey: args.runKey,
        }, null, 2)}\n`);
        return result;
      } catch (error) {
        const result = {
          completedAt: new Date().toISOString(),
          domain: target.normalizedDomain,
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          exactTargetUrl: target.exactTargetUrl,
          outcome: "runner_failed",
          scanId,
          sourceOutcome: target.sourceOutcome,
          sourceScanId: target.sourceScanId ?? target.scanId,
          startedAt,
        };
        console.log(`[${index + 1}/${filtered.length}] ${target.normalizedDomain}: runner_failed`);
        completed.push(result);
        await writeFile(resultsPath, `${JSON.stringify({
          artifactVersion: "certscore.local_reject_path_results.v1",
          generatedAt: new Date().toISOString(),
          results: completed,
          runKey: args.runKey,
        }, null, 2)}\n`);
        return result;
      }
    });
    const resultCounts = results.reduce<Record<string, number>>((counts, result) => {
      const key = String(result.outcome);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const passiveApplicable = results.filter((result) =>
      "passive" in result && result.passive?.rejectState === "observed"
    );
    const passiveApplicableConfirmed = passiveApplicable.filter((result) => result.outcome === "confirmed");
    const passiveSummary = args.withPassiveCheck ? {
      applicableConfirmed: passiveApplicableConfirmed.length,
      applicableCount: passiveApplicable.length,
      applicableSuccessRate: passiveApplicable.length > 0
        ? passiveApplicableConfirmed.length / passiveApplicable.length
        : null,
      notObservedCount: results.filter((result) =>
        "passive" in result && result.passive?.rejectState === "not_observed"
      ).length,
      unknownCount: results.filter((result) =>
        "passive" in result && result.passive?.rejectState === "unknown"
      ).length,
    } : null;
    const generatedAt = new Date().toISOString();
    await writeFile(resultsPath, `${JSON.stringify({
      artifactVersion: "certscore.local_reject_path_results.v1",
      generatedAt,
      resultCounts,
      results,
      runKey: args.runKey,
      passiveSummary,
    }, null, 2)}\n`);
    await writeFile(path.join(runDir, "CalibrationContactManifest.json"), `${JSON.stringify({
      targets: results.map((result) => ({ url: result.exactTargetUrl })),
    }, null, 2)}\n`);
    await writeFile(path.join(runDir, "CalibrationContactSummary.json"), `${JSON.stringify({
      generatedAt,
      results: results.map((result) => ({
        completedAt: result.completedAt,
        runtime: { noGoCandidate: false, noGoReasons: [] },
        scannerRuntimeStarted: true,
        startedAt: result.startedAt,
        status: result.outcome === "runner_failed" ? "failed" : "completed",
        url: result.exactTargetUrl,
      })),
    }, null, 2)}\n`);
    console.log(JSON.stringify({ passiveSummary, resultCounts }, null, 2));
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
