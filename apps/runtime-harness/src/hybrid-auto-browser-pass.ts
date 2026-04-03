import { executeMode, type RuntimeFactory } from "./core/capture";
import { writeHybridAutoBrowserPass, writeRuntimeArtifacts } from "./core/report";
import type { AutoDecisionSummary, RuntimeLogger, RuntimeMode, RuntimeOptions, RuntimeRunResult } from "./core/types";
import { getHybridAutoDecision, type BrowserPassResult, type HybridAutoDecision } from "./hybrid-auto-decision-core";
import { toHybridAutoBrowserPass } from "./hybrid-auto-decision";

export type HybridAutoBrowserPassRun = {
  browserPass: BrowserPassResult;
  decision: HybridAutoDecision;
  runtimeResult: RuntimeRunResult;
};

export type HybridAutoBrowserPassRunnerInput = {
  logger: RuntimeLogger;
  mode: Extract<RuntimeMode, "playwright-local" | "playwright-cdp">;
  options: RuntimeOptions;
  persistArtifacts?: boolean;
  requestedUrl: string;
  runtimeFactory: RuntimeFactory;
};

export type HybridAutoBrowserPassRunner = {
  execute(input: HybridAutoBrowserPassRunnerInput): Promise<HybridAutoBrowserPassRun>;
};

export type HybridAutoSessionInput = {
  buildOptions: (mode: Extract<RuntimeMode, "playwright-local" | "playwright-cdp">) => Promise<RuntimeOptions> | RuntimeOptions;
  logger: RuntimeLogger;
  requestedUrl: string;
  runner: HybridAutoBrowserPassRunner;
  runtimeFactories: Pick<Record<RuntimeMode, RuntimeFactory>, "playwright-local" | "playwright-cdp">;
};

export type HybridAutoSessionResult = {
  autoDecisionSummary: AutoDecisionSummary;
  results: RuntimeRunResult[];
};

export function createDefaultHybridAutoBrowserPassRunner(): HybridAutoBrowserPassRunner {
  return {
    async execute(input: HybridAutoBrowserPassRunnerInput): Promise<HybridAutoBrowserPassRun> {
      const runtimeResult = await executeMode({
        logger: input.logger,
        mode: input.mode,
        options: input.options,
        requestedUrl: input.requestedUrl,
        runtimeFactory: input.runtimeFactory
      });
      const browserPass = toHybridAutoBrowserPass(runtimeResult);
      const decision = getHybridAutoDecision(browserPass);

      if (input.persistArtifacts ?? true) {
        await writeRuntimeArtifacts(runtimeResult.outputDir, runtimeResult);
        await writeHybridAutoBrowserPass(runtimeResult.outputDir, browserPass);
      }

      return {
        browserPass,
        decision,
        runtimeResult
      };
    }
  };
}

export function createHybridAutoBrowserPassRunner(): HybridAutoBrowserPassRunner {
  return createDefaultHybridAutoBrowserPassRunner();
}

export async function executeHybridAutoBrowserPass(input: HybridAutoBrowserPassRunnerInput): Promise<HybridAutoBrowserPassRun> {
  return createHybridAutoBrowserPassRunner().execute(input);
}

export function createHybridAutoDecisionSummary(requestedUrl: string, decision: HybridAutoDecision): AutoDecisionSummary {
  return {
    decision: decision.shouldEscalate ? "escalated_to_cdp" : "stayed_local",
    localMode: "playwright-local",
    reason: decision.reason,
    reasonDetail: decision.detail,
    targetUrl: requestedUrl,
    timestamp: new Date().toISOString()
  };
}

export function markAutoEscalatedRuntimeResult(result: RuntimeRunResult): RuntimeRunResult {
  result.runtimeMetadata.autoEscalated = true;
  result.runQualitySummary.usedEscalation = true;
  result.runQualitySummary.overallConfidence = Math.min(result.runQualitySummary.overallConfidence + 0.05, 0.95);
  result.runQualitySummary.rationale.push("This run was reached via auto escalation from playwright-local.");
  return result;
}

export async function runHybridAutoSession(input: HybridAutoSessionInput): Promise<HybridAutoSessionResult> {
  const localRun = await input.runner.execute({
    logger: input.logger,
    mode: "playwright-local",
    options: await input.buildOptions("playwright-local"),
    requestedUrl: input.requestedUrl,
    runtimeFactory: input.runtimeFactories["playwright-local"]
  });

  const autoDecisionSummary = createHybridAutoDecisionSummary(input.requestedUrl, localRun.decision);
  const results = [localRun.runtimeResult];

  if (!localRun.decision.shouldEscalate) {
    input.logger.log(`[auto] staying on playwright-local; ${autoDecisionSummary.reasonDetail}`);
    return { autoDecisionSummary, results };
  }

  input.logger.log(
    `[auto] escalating from playwright-local to playwright-cdp because ${autoDecisionSummary.reason} (${autoDecisionSummary.reasonDetail})`
  );
  const cdpRun = await input.runner.execute({
    logger: input.logger,
    mode: "playwright-cdp",
    options: await input.buildOptions("playwright-cdp"),
    requestedUrl: input.requestedUrl,
    runtimeFactory: input.runtimeFactories["playwright-cdp"]
  });
  results.push(markAutoEscalatedRuntimeResult(cdpRun.runtimeResult));

  return { autoDecisionSummary, results };
}
