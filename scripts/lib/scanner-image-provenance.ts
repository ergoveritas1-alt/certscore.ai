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
export async function synchronizeScannerImage(control: ScannerImageControl, expectedImage: string, allowCodePromotion: boolean) {
  const digest = scannerImageDigest(expectedImage);
  let current = await control.read(); healthy(current);
  if (current.imageUri.split("@")[0] !== expectedImage.split("@")[0]) throw new Error("Scanner image promotion cannot cross regional repositories.");
  if (current.imageUri !== expectedImage && !allowCodePromotion) throw new Error("Repair must not change deployed scanner code.");
  let changed = false;
  async function setEnvironment(variables: Record<string, string>) {
    const imageBefore = current.imageUri;
    await control.environment(variables, current.revisionId);
    await control.wait();
    current = await control.read(); healthy(current, imageBefore);
    if (!sameEnvironment(current.variables, variables)) throw new Error("Scanner environment did not converge without unrelated changes.");
    changed = true;
  }
  if (current.imageUri !== expectedImage) {
    if (Object.hasOwn(current.variables, "SCANNER_IMAGE_DIGEST")) {
      const cleared = { ...current.variables }; delete cleared.SCANNER_IMAGE_DIGEST;
      await setEnvironment(cleared);
    }
    const expectedVariables = { ...current.variables };
    await control.code(expectedImage, current.revisionId);
    await control.wait();
    current = await control.read(); healthy(current, expectedImage);
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
      const body = JSON.stringify({Variables: variables});
      if (Buffer.byteLength(body) > 4096) throw new Error("Scanner environment exceeds the conservative 4 KiB bound.");
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
