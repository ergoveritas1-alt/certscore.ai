import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const SCANNER_PROVENANCE_REGIONS = ["eu-central-1", "eu-west-1", "us-west-1"] as const;
export type ScannerRegion = typeof SCANNER_PROVENANCE_REGIONS[number];
const FUNCTION = "certscore-v2-dag-local-lambda";
const exec = promisify(execFile);
export type ScannerImageState = { imageUri: string; revisionId: string; state: string; updateStatus: string; variables: Record<string, string> };
export type ScannerImageControl = {
  read(): Promise<ScannerImageState>;
  environment(variables: Record<string, string>, revisionId: string): Promise<void>;
  code(imageUri: string, revisionId: string): Promise<void>;
  wait(): Promise<void>;
};

const SCANNER_ENVIRONMENT_LIMIT = 4096;
const US_RESULT_QUEUE_ALIAS = "CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL";
const SCANNER_RESULT_QUEUE = "CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL";
const SCANNER_ASYNC_FAILURE_QUEUE = "CERTSCORE_V2_DAG_LAMBDA_ASYNC_FAILURE_QUEUE_URL";
const PROSPECTIVE_IMAGE_DIGEST = `sha256:${"0".repeat(64)}`;

/** Lambda sends results to the queue in the invocation payload. Its async
 * failure destination is an AWS function setting. These legacy URL copies are
 * used by external tooling and consumers, never by the scanner process. */
export function compactUsScannerQueueMetadata(current: Record<string, string>, region?: ScannerRegion) {
  const variables = { ...current };
  const removed: string[] = [];
  if (region !== "us-west-1") return { variables, removed };
  const queue = variables[SCANNER_RESULT_QUEUE];
  const alias = variables[US_RESULT_QUEUE_ALIAS];
  const isUsQueue = (value: string | undefined) =>
    typeof value === "string" && /^https:\/\/sqs\.us-west-1\.amazonaws\.com\/\d{12}\/[A-Za-z0-9_-]+(?:\.fifo)?$/.test(value);
  if (isUsQueue(queue) && (alias === undefined || alias === queue)) {
    removed.push(SCANNER_RESULT_QUEUE);
    if (alias !== undefined) removed.push(US_RESULT_QUEUE_ALIAS);
  }
  if (isUsQueue(variables[SCANNER_ASYNC_FAILURE_QUEUE])) removed.push(SCANNER_ASYNC_FAILURE_QUEUE);
  for (const key of removed) delete variables[key];
  return { variables, removed };
}

export function serializeScannerEnvironment(variables: Record<string, string>, target = "Scanner"): string {
  const body = JSON.stringify({ Variables: variables });
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > SCANNER_ENVIRONMENT_LIMIT) {
    throw new Error(`${target} environment exceeds the conservative 4 KiB bound (${bytes}/${SCANNER_ENVIRONMENT_LIMIT} bytes, ${bytes - SCANNER_ENVIRONMENT_LIMIT} over).`);
  }
  return body;
}

export function checkScannerEnvironmentBudget(current: Record<string, string>, beforePromotion: Record<string, string>,
  afterPromotion: Record<string, string>, target: string, repairRegion?: ScannerRegion) {
  const before = { ...current, ...beforePromotion };
  const phases = () => {
    // The digest is always stamped on promotion, even when absent on the current function.
    const stamped = { ...before, SCANNER_IMAGE_DIGEST: PROSPECTIVE_IMAGE_DIGEST };
    return [before, stamped, { ...stamped, ...afterPromotion }];
  };
  const queue = before[SCANNER_RESULT_QUEUE];
  const exceedsBudget = phases().some(variables =>
    Buffer.byteLength(JSON.stringify({ Variables: variables }), "utf8") > SCANNER_ENVIRONMENT_LIMIT);
  // The regional alias is consumed by ECS. It is redundant on US scanner Lambda
  // only when it exactly matches the canonical queue setting.
  const removeDuplicateQueueAlias = exceedsBudget && repairRegion === "us-west-1" &&
    typeof queue === "string" && queue.length > 0 && before[US_RESULT_QUEUE_ALIAS] === queue &&
    !Object.hasOwn(afterPromotion, US_RESULT_QUEUE_ALIAS);
  if (removeDuplicateQueueAlias) delete before[US_RESULT_QUEUE_ALIAS];
  for (const variables of phases()) serializeScannerEnvironment(variables, target);
  return { before, removeDuplicateQueueAlias };
}

export function scannerImageDigest(imageUri: string): string {
  const match = /^199536052647\.dkr\.ecr\.(eu-central-1|eu-west-1|us-west-1)\.amazonaws\.com\/certscore-v2-dag-local-lambda@(sha256:[a-f0-9]{64})$/.exec(imageUri);
  if (!match) throw new Error("Expected an immutable canonical regional scanner image.");
  return match[2]!;
}

function healthy(state: ScannerImageState, expectedImage?: string) {
  scannerImageDigest(state.imageUri);
  if (!state.revisionId || state.state !== "Active" || state.updateStatus !== "Successful" || (expectedImage && state.imageUri !== expectedImage)) throw new Error("Scanner image changed concurrently or is not healthy.");
}

function sameEnvironment(actual: Record<string, string>, expected: Record<string, string>) {
  return Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

/** Clear provenance before changing code; unknown is preferable to a false image claim.
 * The same operation repairs a stale digest on the current image without changing code.
 * Every mutation uses Lambda optimistic revision guards; unrelated settings are preserved.
 */
export async function synchronizeScannerImage(control: ScannerImageControl, expectedImage: string, allowCodePromotion: boolean,
  report?: (timing: { phase: string; ms: number; succeeded: boolean }) => void) {
  async function measure<T>(phase: string, action: () => Promise<T>) {
    const start = performance.now();
    let succeeded = false;
    try {
      const result = await action();
      succeeded = true;
      return result;
    } finally {
      report?.({ phase, ms: Math.round(performance.now() - start), succeeded });
    }
  }
  const digest = scannerImageDigest(expectedImage);
  let current = await measure("initial-read", () => control.read()); healthy(current);
  if (current.imageUri.split("@")[0] !== expectedImage.split("@")[0]) throw new Error("Scanner image promotion cannot cross regional repositories.");
  if (current.imageUri !== expectedImage && !allowCodePromotion) throw new Error("Repair must not change deployed scanner code.");
  let changed = false;
  async function setEnvironment(variables: Record<string, string>) {
    const imageBefore = current.imageUri;
    const phase = Object.hasOwn(variables, "SCANNER_IMAGE_DIGEST") ? "stamp-provenance" : "clear-provenance";
    await measure(phase, () => control.environment(variables, current.revisionId));
    await measure(`${phase}-wait`, () => control.wait());
    current = await measure(`${phase}-readback`, () => control.read()); healthy(current, imageBefore);
    if (!sameEnvironment(current.variables, variables)) throw new Error("Scanner environment did not converge without unrelated changes.");
    changed = true;
  }
  if (current.imageUri !== expectedImage) {
    if (Object.hasOwn(current.variables, "SCANNER_IMAGE_DIGEST")) {
      const cleared = { ...current.variables }; delete cleared.SCANNER_IMAGE_DIGEST;
      await setEnvironment(cleared);
    }
    const expectedVariables = { ...current.variables };
    await measure("code-update", () => control.code(expectedImage, current.revisionId));
    await measure("code-update-wait", () => control.wait());
    current = await measure("code-update-readback", () => control.read()); healthy(current, expectedImage);
    if (!sameEnvironment(current.variables, expectedVariables)) throw new Error("Scanner environment changed during image promotion.");
    changed = true;
  }
  if (current.variables.SCANNER_IMAGE_DIGEST !== digest) await setEnvironment({ ...current.variables, SCANNER_IMAGE_DIGEST: digest });
  healthy(current, expectedImage);
  if (current.variables.SCANNER_IMAGE_DIGEST !== digest) throw new Error("Scanner image provenance is inconsistent.");
  return { changed, imageUri: current.imageUri, imageDigest: digest };
}

export async function scannerAws(region: ScannerRegion, args: string[]) {
  if (!SCANNER_PROVENANCE_REGIONS.includes(region)) throw new Error("Unapproved scanner region.");
  try { return JSON.parse((await exec("aws", [...args, "--region", region, "--output", "json"], {maxBuffer: 1024 * 1024})).stdout || "null"); }
  catch { throw new Error(`Scanner AWS ${args.slice(0,2).join(" ")} failed in ${region}; sensitive configuration omitted.`); }
}

export function awsScannerImageControl(region: ScannerRegion, inventory = false): ScannerImageControl {
  const functionName = inventory ? `${FUNCTION}-inventory` : FUNCTION;
  return {
    async read() {
      const value = await scannerAws(region, ["lambda", "get-function", "--function-name", functionName, "--query", "{imageUri:Code.ResolvedImageUri,revisionId:Configuration.RevisionId,state:Configuration.State,updateStatus:Configuration.LastUpdateStatus,timeout:Configuration.Timeout,variables:Configuration.Environment.Variables,environmentError:Configuration.Environment.Error}"]);
      if (value?.environmentError || !value?.variables || Object.values(value.variables).some(item => typeof item !== "string")) throw new Error("Scanner environment is unavailable.");
      healthy(value);
      if (inventory && (value.timeout !== 25 || value.variables.CERTSCORE_FULL_SITE_INVENTORY_WORKER !== "1")) throw new Error("Inventory worker must have its dedicated 25-second configuration before image promotion.");
      if (!value.imageUri.startsWith(`199536052647.dkr.ecr.${region}.amazonaws.com/`)) throw new Error("Scanner image region mismatch.");
      return value;
    },
    async environment(variables, revisionId) {
      const body = serializeScannerEnvironment(variables, `${region}/${functionName}`);
      const directory = await mkdtemp(path.join(tmpdir(), "certscore-scanner-provenance-"));
      try {
        const filename = path.join(directory, "environment.json");
        await writeFile(filename, body, {mode: 0o600});
        await scannerAws(region, ["lambda", "update-function-configuration", "--function-name", functionName, "--revision-id", revisionId, "--environment", `file://${filename}`, "--query", "RevisionId"]);
      } finally { await rm(directory, {recursive: true, force: true}); }
    },
    async code(imageUri, revisionId) {
      scannerImageDigest(imageUri);
      await scannerAws(region, ["lambda", "update-function-code", "--function-name", functionName, "--revision-id", revisionId, "--image-uri", imageUri, "--query", "RevisionId"]);
    },
    async wait() { await scannerAws(region, ["lambda", "wait", "function-updated-v2", "--function-name", functionName]); },
  };
}
