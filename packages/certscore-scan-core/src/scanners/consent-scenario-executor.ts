import type {
  ConsentActionAttempt,
  ConsentActionType,
  ConsentFlowScenario,
} from "@certscore/contracts";
import { comparePlanItems, type ConsentScenarioPlanItem, type ConsentScenarioSkippedItem } from "./consent-scenario-planner.js";

export interface ConsentScenarioExecutionEntry {
  scenario: ConsentFlowScenario;
  actionType?: ConsentActionType;
  targetUrl?: string;
  reasonCodes: string[];
  status: "completed" | "failed" | "skipped";
  startedAtMs?: number;
  completedAtMs?: number;
  durationMs?: number;
  phaseTimings?: ScenarioPhaseTiming[];
  actionProofStatus: "not_required" | "attempted_succeeded" | "attempted_failed" | "not_attempted" | "not_available";
  comparisonEligible: boolean;
  deadlineHit: boolean;
  failureReason?: string;
  error?: string;
}

export interface ScenarioPhaseTiming {
  label: string;
  durationMs: number;
  detail?: string;
}

export interface ConsentScenarioExecutionResult<TCapture> {
  captures: TCapture[];
  entries: ConsentScenarioExecutionEntry[];
}

export async function executeConsentScenarioPlan<TCapture extends {
  scenario: ConsentFlowScenario;
  actionAttempts: ConsentActionAttempt[];
  phaseTimings?: ScenarioPhaseTiming[];
}>(
  input: {
    plannedScenarios: ConsentScenarioPlanItem[];
    skippedScenarios: ConsentScenarioSkippedItem[];
    concurrency: number;
    deadlineAtMs: number;
    runScenario: (scenario: ConsentScenarioPlanItem) => Promise<TCapture>;
  },
): Promise<ConsentScenarioExecutionResult<TCapture>> {
  const baseline = input.plannedScenarios.find((item) => item.scenario === "baseline_pre_consent");
  if (!baseline) {
    throw new Error("Planned consent scenario execution requires baseline_pre_consent.");
  }

  const captures: TCapture[] = [];
  const entries: ConsentScenarioExecutionEntry[] = input.skippedScenarios.map((item) => ({
    scenario: item.scenario,
    actionType: item.actionType,
    targetUrl: item.targetUrl,
    reasonCodes: item.reasonCodes,
    status: "skipped",
    actionProofStatus: "not_available",
    comparisonEligible: false,
    deadlineHit: item.skipReason === "deadline_hit" || item.skipReason === "budget_exhausted",
    failureReason: item.skipReason,
  }));

  const baselineResult = await runOne(baseline, input);
  entries.push(baselineResult.entry);
  if (!baselineResult.capture) {
    throw new Error(baselineResult.entry.error ?? baselineResult.entry.failureReason ?? "Baseline consent scenario failed.");
  }
  captures.push(baselineResult.capture);

  const remaining = input.plannedScenarios
    .filter((item) => item.scenario !== "baseline_pre_consent")
    .sort(compareExecutionStartOrder);
  const deadlineSkipped: ConsentScenarioExecutionEntry[] = [];
  const runnable = remaining.filter((item) => {
    if (Date.now() <= input.deadlineAtMs) {
      return true;
    }
    deadlineSkipped.push({
      scenario: item.scenario,
      actionType: item.actionType,
      targetUrl: item.targetUrl,
      reasonCodes: [...item.reasonCodes, "deadline_hit_before_start"],
      status: "skipped",
      actionProofStatus: "not_available",
      comparisonEligible: false,
      deadlineHit: true,
      failureReason: "deadline_hit",
    });
    return false;
  });
  entries.push(...deadlineSkipped);

  const parallelResults = await runWithConcurrency(runnable, Math.max(1, input.concurrency), (item) =>
    runOne(item, input)
  );
  for (const result of parallelResults) {
    entries.push(result.entry);
    if (result.capture) {
      captures.push(result.capture);
    }
  }

  return {
    captures: captures.sort(comparePlanItems),
    entries: entries.sort(comparePlanItems),
  };
}

function compareExecutionStartOrder(
  left: ConsentScenarioPlanItem,
  right: ConsentScenarioPlanItem,
): number {
  const priority = (item: ConsentScenarioPlanItem): number => {
    switch (item.scenario) {
      case "reject_all_flow":
        return 0;
      case "accept_all_flow":
        return 1;
      case "privacy_opt_out_flow":
        return item.targetUrl ? 2 : 3;
      case "gpc_enabled":
        return 4;
      case "form_collection_probe":
        return 5;
      case "accessibility_probe":
        return 6;
      default:
        return 9;
    }
  };
  return priority(left) - priority(right) || comparePlanItems(left, right);
}

async function runOne<TCapture extends {
  scenario: ConsentFlowScenario;
  actionAttempts: ConsentActionAttempt[];
  phaseTimings?: ScenarioPhaseTiming[];
}>(
  item: ConsentScenarioPlanItem,
  input: {
    deadlineAtMs: number;
    runScenario: (scenario: ConsentScenarioPlanItem) => Promise<TCapture>;
  },
): Promise<{ capture?: TCapture; entry: ConsentScenarioExecutionEntry }> {
  const startedAtMs = Date.now();
  const minimumRemainingMs = minimumScenarioStartBudgetMs(item);
  if (startedAtMs > input.deadlineAtMs || input.deadlineAtMs - startedAtMs < minimumRemainingMs) {
    return {
      entry: {
        scenario: item.scenario,
        actionType: item.actionType,
        targetUrl: item.targetUrl,
        reasonCodes: [
          ...item.reasonCodes,
          startedAtMs > input.deadlineAtMs ? "deadline_hit_before_start" : "insufficient_global_budget_before_start",
        ],
        status: "skipped",
        startedAtMs,
        completedAtMs: startedAtMs,
        durationMs: 0,
        actionProofStatus: "not_available",
        comparisonEligible: false,
        deadlineHit: true,
        failureReason: startedAtMs > input.deadlineAtMs ? "deadline_hit" : "budget_exhausted",
      },
    };
  }
  try {
    const capture = await input.runScenario(item);
    const completedAtMs = Date.now();
    return {
      capture,
      entry: {
        scenario: item.scenario,
        actionType: item.actionType,
        targetUrl: item.targetUrl,
        reasonCodes: item.reasonCodes,
        status: "completed",
        startedAtMs,
        completedAtMs,
        durationMs: completedAtMs - startedAtMs,
        phaseTimings: capture.phaseTimings ?? [],
        actionProofStatus: actionProofStatus(capture, item.actionType),
        comparisonEligible: comparisonEligible(capture, item.actionType),
        deadlineHit: completedAtMs > input.deadlineAtMs,
      },
    };
  } catch (error) {
    const completedAtMs = Date.now();
    return {
      entry: {
        scenario: item.scenario,
        actionType: item.actionType,
        targetUrl: item.targetUrl,
        reasonCodes: item.reasonCodes,
        status: "failed",
        startedAtMs,
        completedAtMs,
        durationMs: completedAtMs - startedAtMs,
        actionProofStatus: "not_available",
        comparisonEligible: false,
        deadlineHit: completedAtMs > input.deadlineAtMs,
        error: boundedScenarioError(error),
      },
    };
  }
}

function boundedScenarioError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function minimumScenarioStartBudgetMs(item: ConsentScenarioPlanItem): number {
  if (item.scenario === "baseline_pre_consent") {
    return 0;
  }
  if (item.scenario === "gpc_enabled") {
    return 4_500;
  }
  if (item.scenario === "privacy_opt_out_flow") {
    return item.targetUrl ? 7_500 : 5_000;
  }
  if (item.actionType) {
    return 6_500;
  }
  return 3_500;
}

function actionProofStatus(
  capture: { actionAttempts: ConsentActionAttempt[] },
  actionType: ConsentActionType | undefined,
): ConsentScenarioExecutionEntry["actionProofStatus"] {
  if (!actionType) {
    return "not_required";
  }
  const attempt = capture.actionAttempts.find((item) =>
    item.actionType === actionType &&
    item.succeeded &&
    item.actionProof?.attemptedStatus === "attempted_succeeded"
  ) ?? capture.actionAttempts.find((item) => item.actionType === actionType);
  if (!attempt) {
    return "not_available";
  }
  return attempt.attempted
    ? attempt.succeeded ? "attempted_succeeded" : "attempted_failed"
    : "not_attempted";
}

function comparisonEligible(
  capture: { actionAttempts: ConsentActionAttempt[] },
  actionType: ConsentActionType | undefined,
): boolean {
  if (!actionType) {
    return true;
  }
  return capture.actionAttempts.some((attempt) =>
    attempt.actionType === actionType &&
    attempt.succeeded &&
    attempt.actionProof?.attemptedStatus === "attempted_succeeded" &&
    (attempt.actionProof.candidateConfidence ?? 0.78) >= 0.78
  );
}

async function runWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}
