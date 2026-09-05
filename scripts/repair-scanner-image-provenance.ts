import { execFileSync } from "node:child_process";
import { awsScannerImageControl, scannerAws, scannerImageDigest, SCANNER_PROVENANCE_REGIONS, synchronizeScannerImage } from "./lib/scanner-image-provenance";

async function main() {
  const args = process.argv.slice(2);
  const expectedSha = args[args.indexOf("--expected-sha") + 1];
  if (!args.includes("--expected-sha") || !/^[a-f0-9]{40}$/.test(expectedSha ?? "")) throw new Error("Exact tested --expected-sha required.");
  const apply = args.includes("--apply");
  if (apply && execFileSync("git", ["status", "--porcelain"], {encoding:"utf8"}).trim()) throw new Error("Commit tested source before repair.");
  if ((await scannerAws("us-west-1", ["sts", "get-caller-identity"])).Account !== "199536052647") throw new Error("Unexpected AWS account.");
  // Validate every region before any mutation; this command never changes code or capacity.
  const plans = await Promise.all(SCANNER_PROVENANCE_REGIONS.map(async region => {
    const control = awsScannerImageControl(region);
    const current = await control.read();
    const expectedDigest = await scannerAws(region, ["ecr", "describe-images", "--repository-name", "certscore-v2-dag-local-lambda", "--image-ids", `imageTag=${expectedSha}`, "--query", "imageDetails[0].imageDigest"]);
    if (scannerImageDigest(current.imageUri) !== expectedDigest) throw new Error(`Deployed ${region} scanner does not match the tested SHA.`);
    return {region, control, expectedImage: current.imageUri, needsRepair: current.variables.SCANNER_IMAGE_DIGEST !== expectedDigest};
  }));
  if (new Set(plans.map(plan => scannerImageDigest(plan.expectedImage))).size !== 1) throw new Error("Regional image parity failed.");
  console.info(JSON.stringify({action:apply?"apply_requested":"plan_only",expectedSha,capacityChange:false,codeChange:false,regions:plans.map(({region,expectedImage,needsRepair})=>({region,expectedImage,needsRepair}))}));
  if (apply) for (const plan of plans) console.info(JSON.stringify({region:plan.region,...await synchronizeScannerImage(plan.control, plan.expectedImage, false),status:"verified"}));
}
if (process.argv[1]?.endsWith("/repair-scanner-image-provenance.ts")) void main().catch(error => { console.error(error instanceof Error ? error.message : "Scanner provenance repair failed."); process.exitCode=1; });
