import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import passiveCanaries from "../docs/certscore-v2/ergoveritas-owned-live-canaries.json";
import acceptCanaries from "../docs/certscore-v2/post-accept-owned-live-canaries.json";
import rejectCanaries from "../docs/certscore-v2/post-refusal-owned-live-canaries.json";

const exec = promisify(execFile);
const REGION = "us-west-1";
const CLUSTER = "certscore-web-cluster";
const SERVICES = ["certscore-web-certscore", "certscore-web-materializer"] as const;
const FLAGS = ["CERTSCORE_RUNTIME_GRAPH_MODE", "CERTSCORE_RUNTIME_GRAPH_PERCENT", "CERTSCORE_RUNTIME_GRAPH_CANARY_SCAN_IDS", "CERTSCORE_RUNTIME_GRAPH_PRESENTATION", "CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS"];
const ownedTargets = new Set([...passiveCanaries.targets, ...acceptCanaries.targets, ...rejectCanaries.targets].map(row => row.url).concat(acceptCanaries.interactionPolicy.authorizedAlternateExactTargets, rejectCanaries.interactionPolicy.authorizedAlternateExactTargets));
export type Rollout = { mode: "off" | "capture_only" | "project"; percent: 0 | 5 | 25 | 100; presentation: "on" | "off"; canaryScanIds: string[]; canaryTargetUrls?: string[]; expectedWebSha: string; expectedScannerSha?: string };

export function graphReleaseSourceRevisions(rollout: Pick<Rollout, "expectedWebSha" | "expectedScannerSha">) {
  const scanner = rollout.expectedScannerSha ?? rollout.expectedWebSha;
  if (![rollout.expectedWebSha, scanner].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error("Exact tested reader and scanner SHAs are required.");
  return { readers: rollout.expectedWebSha, scanner };
}

export function graphRolloutTaskDefinition(task: Record<string, any>, rollout: Rollout, taskTags?: Array<{ key: string; value: string }>) {
  if (!["off", "capture_only", "project"].includes(rollout.mode) || ![0, 5, 25, 100].includes(rollout.percent) || !["on", "off"].includes(rollout.presentation)) throw new Error("Invalid bounded graph rollout.");
  graphReleaseSourceRevisions(rollout);
  const canaryTargets = rollout.canaryTargetUrls ?? [];
  if (rollout.mode === "off" && (rollout.percent !== 0 || rollout.canaryScanIds.length || canaryTargets.length)) throw new Error("Disabled capture must have no enabled cohort.");
  if (canaryTargets.length > 20 || new Set(canaryTargets).size !== canaryTargets.length || canaryTargets.some(url => !ownedTargets.has(url))) throw new Error("Canary targets must exactly match the checked-in owned registries. Graph selection never authorizes consent actions.");
  if (rollout.canaryScanIds.length > 240 || new Set(rollout.canaryScanIds).size !== rollout.canaryScanIds.length || rollout.canaryScanIds.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))) throw new Error("Canary IDs must be bounded unique scan UUIDs.");
  const copy = structuredClone(task);
  const retainedTags = (taskTags ?? copy.tags ?? []).filter((tag: { key: string }) => !tag.key.startsWith("aws:"));
  if (retainedTags.length) copy.tags = retainedTags;
  else delete copy.tags; // ECS rejects an explicit empty tags array; omission preserves an untagged task.
  const containers = copy.containerDefinitions as Array<Record<string, any>>;
  if (!Array.isArray(containers) || containers.length !== 1 || containers[0]?.name !== "certscore-web" || containers[0]?.image !== `199536052647.dkr.ecr.${REGION}.amazonaws.com/certscore-web-web:${rollout.expectedWebSha}`) throw new Error("Unexpected web container or live image revision.");
  const container = containers[0]!;
  container.environment = [
    ...(container.environment ?? []).filter((entry: { name: string }) => !FLAGS.includes(entry.name)),
    { name: FLAGS[0], value: rollout.mode }, { name: FLAGS[1], value: String(rollout.percent) },
    { name: FLAGS[2], value: rollout.canaryScanIds.join(",") }, { name: FLAGS[3], value: rollout.presentation },
    { name: FLAGS[4], value: JSON.stringify(canaryTargets) },
  ];
  for (const field of ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]) delete copy[field];
  return copy;
}

async function aws(args: string[], region = REGION) {
  try { return JSON.parse((await exec("aws", [...args, "--region", region, "--output", "json"], { maxBuffer: 2 * 1024 * 1024 })).stdout); }
  catch { throw new Error(`AWS ${args.slice(0, 2).join(" ")} failed; no task-definition contents logged.`); }
}

export function assertGraphReleaseService(service: any, containers: any, containerName: string, image: string) {
  if (service?.status !== "ACTIVE" || service.runningCount !== service.desiredCount || service.desiredCount < 1 || service.deployments?.length !== 1 || !Array.isArray(containers) || containers.length !== 1 || containers[0]?.name !== containerName || containers[0]?.image !== image) throw new Error("A required graph producer/reader has not converged on the tested release.");
}

export function graphReleaseRequirements(rollout: Pick<Rollout, "mode" | "presentation">) {
  return { producers: rollout.mode !== "off", readers: rollout.presentation === "on" };
}

export function assertGraphReleaseScanner(deployed: any, region: string, digest: unknown) {
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest) || deployed?.image !== `199536052647.dkr.ecr.${region}.amazonaws.com/certscore-v2-dag-local-lambda@${digest}` || deployed.recordedDigest !== digest || deployed.state !== "Active" || deployed.status !== "Successful") throw new Error(`The ${region} scanner image or retained provenance has not converged on the tested graph release.`);
}

async function verifyReleaseParticipants(rollout: Rollout) {
  // Capture and presentation are independent: old/queued project graphs can
  // become readable even when new capture is off. Emergency suppression of
  // both remains available without healthy producer/reader participants.
  const required = graphReleaseRequirements(rollout);
  const revisions = graphReleaseSourceRevisions(rollout);
  for (const target of [
    ...(required.producers ? [{ cluster: "certscore-validation-cluster", service: "certscore-validation-worker", container: "validation-worker", repository: "certscore-validation-worker" }] : []),
    ...(required.readers ? [{ cluster: CLUSTER, service: "certscore-web-mcp", container: "mcp-http", repository: "certscore-web-mcp" }] : []),
  ]) {
    const described = await aws(["ecs", "describe-services", "--cluster", target.cluster, "--services", target.service]);
    const service = described.services?.[0];
    if (described.failures?.length || !service?.taskDefinition) throw new Error("A required graph release service is unavailable.");
    const containers = await aws(["ecs", "describe-task-definition", "--task-definition", service.taskDefinition, "--query", "taskDefinition.containerDefinitions[].{name:name,image:image}"]);
    assertGraphReleaseService(service, containers, target.container, `199536052647.dkr.ecr.${REGION}.amazonaws.com/${target.repository}:${rollout.expectedWebSha}`);
  }
  for (const region of required.producers ? ["eu-central-1", "eu-west-1", "us-west-1"] : []) {
    const digest = await aws(["ecr", "describe-images", "--repository-name", "certscore-v2-dag-local-lambda", "--image-ids", `imageTag=${revisions.scanner}`, "--query", "imageDetails[0].imageDigest"], region);
    const deployed = await aws(["lambda", "get-function", "--function-name", "certscore-v2-dag-local-lambda", "--query", "{image:Code.ResolvedImageUri,recordedDigest:Configuration.Environment.Variables.SCANNER_IMAGE_DIGEST,state:Configuration.State,status:Configuration.LastUpdateStatus}"], region);
    assertGraphReleaseScanner(deployed, region, digest);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const argument = (name: string) => { const index = args.indexOf(name); if (index < 0 || !args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error(`Missing ${name}`); return args[index + 1]!; };
  const rollout: Rollout = { mode: argument("--mode") as Rollout["mode"], percent: Number(argument("--percent")) as Rollout["percent"], presentation: argument("--presentation") as Rollout["presentation"], expectedWebSha: argument("--expected-web-sha"), canaryScanIds: args.includes("--canary-scan-ids") ? argument("--canary-scan-ids").split(",") : [] };
  if (args.includes("--canary-target-urls")) rollout.canaryTargetUrls = argument("--canary-target-urls").split(",");
  if (args.includes("--expected-scanner-sha")) rollout.expectedScannerSha = argument("--expected-scanner-sha");
  const apply = args.includes("--apply");
  if ((await aws(["sts", "get-caller-identity"])).Account !== "199536052647") throw new Error("Unexpected AWS account.");
  if (apply && (await exec("git", ["status", "--porcelain"])).stdout.trim()) throw new Error("Commit the tested worktree before a production rollout.");
  const live = await aws(["ecs", "describe-services", "--cluster", CLUSTER, "--services", ...SERVICES]);
  if (live.failures?.length || live.services?.length !== SERVICES.length) throw new Error("Both canonical web/materializer services must exist.");
  const plans = [];
  for (const service of live.services) {
    if (!SERVICES.includes(service.serviceName) || service.status !== "ACTIVE" || service.runningCount !== service.desiredCount || service.deployments?.length !== 1) throw new Error("Services must be stable before rollout.");
    const described = await aws(["ecs", "describe-task-definition", "--task-definition", service.taskDefinition, "--include", "TAGS"]);
    const task = graphRolloutTaskDefinition(described.taskDefinition, rollout, described.tags ?? []);
    plans.push({ serviceName: service.serviceName, previousTaskDefinition: service.taskDefinition, task });
  }
  await verifyReleaseParticipants(rollout);
  console.info(JSON.stringify({ action: apply ? "apply_requested" : "plan_only", region: REGION, cluster: CLUSTER, services: plans.map(plan => plan.serviceName), mode: rollout.mode, percent: rollout.percent, presentation: rollout.presentation, canaryScanCount: rollout.canaryScanIds.length, canaryTargetUrls: rollout.canaryTargetUrls ?? [], expectedWebSha: rollout.expectedWebSha, expectedScannerSha: graphReleaseSourceRevisions(rollout).scanner, capacityChange: false, consentActionAuthorizationChange: false }));
  if (!apply) return;
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-graph-rollout-"));
  try {
    for (const plan of plans) {
      const current = await aws(["ecs", "describe-services", "--cluster", CLUSTER, "--services", plan.serviceName]);
      if (current.services?.[0]?.taskDefinition !== plan.previousTaskDefinition || current.services[0].deployments?.length !== 1) throw new Error("Concurrent deployment detected; stop and inspect partial rollout.");
      const inputFile = path.join(directory, `${plan.serviceName}.json`);
      await writeFile(inputFile, JSON.stringify(plan.task), { mode: 0o600 });
      const registered = await aws(["ecs", "register-task-definition", "--cli-input-json", `file://${inputFile}`]);
      const next = registered.taskDefinition?.taskDefinitionArn;
      if (typeof next !== "string") throw new Error("Task registration did not return an identity.");
      await aws(["ecs", "update-service", "--cluster", CLUSTER, "--service", plan.serviceName, "--task-definition", next]);
      console.info(JSON.stringify({ service: plan.serviceName, previousTaskDefinition: plan.previousTaskDefinition, taskDefinition: next, status: "rollout_requested_not_yet_verified" }));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
  console.info("Verify both ECS services reach stability and inspect completed-scan evidence before promoting another cohort. This command does not claim deployment success.");
}
if (process.argv[1]?.endsWith("/runtime-graph-rollout.ts")) void main().catch(error => { console.error(error instanceof Error ? error.message : "Graph rollout failed."); process.exitCode = 1; });
