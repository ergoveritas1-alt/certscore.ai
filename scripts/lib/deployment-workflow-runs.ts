export type DeploymentWorkflowRun = {
  databaseId: number;
  headSha: string;
  status: string;
  conclusion?: string | null;
  event?: string;
};

const ACTIVE_STATUSES = new Set(["queued", "pending", "waiting", "requested", "in_progress"]);

export function requireExpectedWebRevision(payload: unknown, targetSha: string) {
  if (!payload || typeof payload !== "object") throw new Error("Live web revision metadata is unavailable");
  const version = payload as { gitSha?: unknown; runtimeTarget?: unknown };
  if (version.gitSha !== targetSha || version.runtimeTarget !== "ecs-fargate") {
    throw new Error(`Live web must serve ${targetSha} on ecs-fargate before deployment succeeds`);
  }
}

export function reusableDeploymentWorkflowRun(runs: DeploymentWorkflowRun[], targetSha: string) {
  const matching = runs.filter(run => run.headSha === targetSha && Number.isSafeInteger(run.databaseId) && run.databaseId > 0);
  return matching.find(run => run.status === "completed" && run.conclusion === "success")
    ?? matching.find(run => run.status === "in_progress")
    ?? matching.find(run => ACTIVE_STATUSES.has(run.status));
}

export async function resolveDeploymentWorkflowRun(input: {
  targetSha: string;
  forceDispatch?: boolean;
  registrationGraceMs?: number;
  list: () => Promise<DeploymentWorkflowRun[]>;
  dispatch: () => Promise<void>;
  now?: () => number;
  sleep: (ms: number) => Promise<void>;
}) {
  const now = input.now ?? Date.now;
  let runs = await input.list();
  if (!input.forceDispatch) {
    const graceDeadline = now() + (input.registrationGraceMs ?? 0);
    while (true) {
      const existing = reusableDeploymentWorkflowRun(runs, input.targetSha);
      if (existing) return String(existing.databaseId);
      if (now() >= graceDeadline) break;
      await input.sleep(Math.min(2000, graceDeadline - now()));
      runs = await input.list();
    }
  }

  const before = new Set(runs.map(run => run.databaseId));
  await input.dispatch();
  const deadline = now() + 90_000;
  while (now() < deadline) {
    await input.sleep(3000);
    runs = await input.list();
    const dispatched = runs.find(run => run.headSha === input.targetSha
      && Number.isSafeInteger(run.databaseId) && run.databaseId > 0
      && !before.has(run.databaseId) && run.event === "workflow_dispatch");
    if (dispatched) return String(dispatched.databaseId);
  }
  throw new Error(`Timed out waiting for the dispatched workflow for ${input.targetSha}`);
}
