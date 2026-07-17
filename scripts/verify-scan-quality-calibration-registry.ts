import { readFile } from "node:fs/promises";
import path from "node:path";

type Manifest = {
  manifestVersion: string;
  sourceUrlList: string;
  requiredLanes: string[];
  laneDefinitions: Record<string, string>;
  targets: Array<{ url: string; role: string; lanes: string[] }>;
};

const root = process.cwd();
const manifestPath = path.join(root, "docs/certscore-v2/scan-quality-calibration-manifest.json");
const urlsPath = path.join(root, "docs/certscore-v2/calibration-urls-lab-50.txt");

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const sourceUrls = (await readFile(urlsPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http://") || line.startsWith("https://"));

  const targetUrls = manifest.targets.map((target) => target.url);
  const uniqueTargetUrls = new Set(targetUrls);
  const errors: string[] = [];

  if (manifest.manifestVersion !== "certscore.scan_quality_calibration.1") {
    errors.push(`Unsupported manifest version: ${manifest.manifestVersion}`);
  }
  if (manifest.sourceUrlList !== "docs/certscore-v2/calibration-urls-lab-50.txt") {
    errors.push(`Manifest must use the canonical URL list, got ${manifest.sourceUrlList}`);
  }
  if (sourceUrls.length < 30 || sourceUrls.length > 50) {
    errors.push(`Canonical cohort must contain 30-50 URLs, found ${sourceUrls.length}`);
  }
  if (uniqueTargetUrls.size !== targetUrls.length) {
    errors.push("Manifest contains duplicate target URLs");
  }
  if (sourceUrls.length !== targetUrls.length || sourceUrls.some((url, index) => url !== targetUrls[index])) {
    errors.push("Manifest targets must exactly match calibration-urls-lab-50.txt in order");
  }

  for (const lane of manifest.requiredLanes) {
    if (!manifest.laneDefinitions[lane]) errors.push(`Missing lane definition: ${lane}`);
  }

  for (const target of manifest.targets) {
    if (!target.role) errors.push(`Missing cohort role for ${target.url}`);
    if (target.lanes.length === 0) errors.push(`Missing calibration lanes for ${target.url}`);
    for (const lane of target.lanes) {
      if (!manifest.laneDefinitions[lane]) errors.push(`Unknown lane ${lane} for ${target.url}`);
    }
  }

  for (const lane of manifest.requiredLanes) {
    const covered = manifest.targets.filter((target) => target.lanes.includes(lane)).length;
    if (covered === 0) errors.push(`Required lane has no cohort coverage: ${lane}`);
  }

  if (errors.length > 0) {
    console.error("Scan-quality calibration registry failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Scan-quality calibration registry passed: ${manifest.targets.length} targets, ${manifest.requiredLanes.length} lanes.`);
}

void main();
