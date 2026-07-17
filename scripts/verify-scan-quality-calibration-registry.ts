import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  validateCalibrationLedger,
  type CalibrationLedger,
} from "./lib/scan-quality-calibration-ledger.js";

type Manifest = {
  manifestVersion: string;
  sourceUrlList: string;
  eligibilityLedger: string;
  centralContactLedger: {
    eventTable: string;
    failsClosedWhenUnavailable: boolean;
    includesAllScanChannels: boolean;
    requiredForLiveSelection: boolean;
    table: string;
  };
  calibrationModel: {
    baselineUnit: string;
    publicTargetMode: string;
    fixedSiteRepetitionProhibited: boolean;
  };
  layers: {
    deterministicFixtures: {
      requiredForEveryScannerChange: boolean;
      initiatesPublicTraffic: boolean;
    };
    retainedReplay: {
      requiredForEveryScannerChange: boolean;
      initiatesPublicTraffic: boolean;
      boundedSanitizedArtifactsRequired: boolean;
    };
    ownedCanaries: {
      requiredForScannerRelease: boolean;
      initiatesPublicTraffic: boolean;
      ownershipRequired: boolean;
    };
    rotatingPublicSample: {
      requiredForScannerRelease: boolean;
      initiatesPublicTraffic: boolean;
      requiresEligibilityAttestation: boolean;
      minimumSize: number;
      defaultSize: number;
      maximumSize: number;
    };
    passiveProductionSampling: {
      requiredForPostDeployReview: boolean;
      initiatesAdditionalTraffic: boolean;
      defaultSampleSize: number;
    };
  };
  publicContactPolicy: {
    minimumCooldownDays: number;
    maximumConcurrentScansPerDomain: number;
    automaticRetryAfterNoGo: boolean;
    crossRegionRetryAfterBlock: boolean;
    retireAfterRepeatedNoGo: boolean;
    eligibilityStates: string[];
  };
  requiredLanes: string[];
  laneDefinitions: Record<string, string>;
  targets: Array<{ url: string; role: string; lanes: string[] }>;
};

const root = process.cwd();
const manifestPath = path.join(root, "docs/certscore-v2/scan-quality-calibration-manifest.json");
const urlsPath = path.join(root, "docs/certscore-v2/calibration-urls-lab-50.txt");

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const ledgerPath = path.join(root, manifest.eligibilityLedger);
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as CalibrationLedger;
  const sourceUrls = (await readFile(urlsPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http://") || line.startsWith("https://"));

  const targetUrls = manifest.targets.map((target) => target.url);
  const uniqueTargetUrls = new Set(targetUrls);
  const errors: string[] = [];

  if (manifest.manifestVersion !== "certscore.scan_quality_calibration.2") {
    errors.push(`Unsupported manifest version: ${manifest.manifestVersion}`);
  }
  if (manifest.sourceUrlList !== "docs/certscore-v2/calibration-urls-lab-50.txt") {
    errors.push(`Manifest must use the canonical URL list, got ${manifest.sourceUrlList}`);
  }
  if (manifest.eligibilityLedger !== "docs/certscore-v2/scan-quality-calibration-ledger.json") {
    errors.push(`Manifest must use the canonical eligibility ledger, got ${manifest.eligibilityLedger}`);
  }
  if (
    manifest.centralContactLedger?.table !== "public.scan_domain_contact_ledger" ||
    manifest.centralContactLedger?.eventTable !== "public.scan_domain_contacts" ||
    manifest.centralContactLedger?.requiredForLiveSelection !== true ||
    manifest.centralContactLedger?.includesAllScanChannels !== true ||
    manifest.centralContactLedger?.failsClosedWhenUnavailable !== true
  ) {
    errors.push("Central scan-contact history must cover all channels and fail closed for live selection");
  }
  if (sourceUrls.length < 30 || sourceUrls.length > 100) {
    errors.push(`Rotating target inventory must contain 30-100 URLs, found ${sourceUrls.length}`);
  }
  if (uniqueTargetUrls.size !== targetUrls.length) {
    errors.push("Manifest contains duplicate target URLs");
  }
  if (sourceUrls.length !== targetUrls.length || sourceUrls.some((url, index) => url !== targetUrls[index])) {
    errors.push("Manifest target inventory must exactly match calibration-urls-lab-50.txt in order");
  }
  errors.push(...validateCalibrationLedger(ledger, uniqueTargetUrls));

  if (manifest.calibrationModel?.baselineUnit !== "capability_lane") {
    errors.push("Calibration baseline must be capability-lane based");
  }
  if (manifest.calibrationModel?.publicTargetMode !== "rotating_inventory") {
    errors.push("Public calibration targets must use rotating-inventory mode");
  }
  if (manifest.calibrationModel?.fixedSiteRepetitionProhibited !== true) {
    errors.push("Fixed-site repetition must be explicitly prohibited");
  }

  const publicSample = manifest.layers?.rotatingPublicSample;
  if (
    !publicSample ||
    publicSample.minimumSize < 1 ||
    publicSample.minimumSize > publicSample.defaultSize ||
    publicSample.defaultSize > publicSample.maximumSize ||
    publicSample.maximumSize >= sourceUrls.length
  ) {
    errors.push("Rotating public sample bounds must be ordered and smaller than the target inventory");
  }
  if (
    publicSample?.requiredForScannerRelease !== true ||
    publicSample?.initiatesPublicTraffic !== true ||
    publicSample?.requiresEligibilityAttestation !== true
  ) {
    errors.push("Rotating public sampling must require scanner-release eligibility attestation");
  }
  if (
    manifest.layers?.deterministicFixtures?.requiredForEveryScannerChange !== true ||
    manifest.layers.deterministicFixtures.initiatesPublicTraffic !== false
  ) {
    errors.push("Deterministic fixtures must gate every scanner change without public traffic");
  }
  if (
    manifest.layers?.retainedReplay?.requiredForEveryScannerChange !== true ||
    manifest.layers.retainedReplay.initiatesPublicTraffic !== false ||
    manifest.layers.retainedReplay.boundedSanitizedArtifactsRequired !== true
  ) {
    errors.push("Retained replay must be required, bounded, sanitized, and traffic-free");
  }
  if (
    manifest.layers?.ownedCanaries?.requiredForScannerRelease !== true ||
    manifest.layers.ownedCanaries.ownershipRequired !== true
  ) {
    errors.push("Owned canaries must gate scanner releases and require verified ownership");
  }
  if (
    manifest.layers?.passiveProductionSampling?.requiredForPostDeployReview !== true ||
    manifest.layers.passiveProductionSampling.initiatesAdditionalTraffic !== false
  ) {
    errors.push("Post-deploy production sampling must be passive and initiate no additional traffic");
  }

  const contactPolicy = manifest.publicContactPolicy;
  if (!contactPolicy || contactPolicy.minimumCooldownDays < 28) {
    errors.push("Public calibration targets must have a cooldown of at least 28 days");
  }
  if (contactPolicy?.maximumConcurrentScansPerDomain !== 1) {
    errors.push("At most one public calibration scan may run per domain at a time");
  }
  if (contactPolicy?.automaticRetryAfterNoGo !== false) {
    errors.push("Automatic retry after a no-go outcome must be disabled");
  }
  if (contactPolicy?.crossRegionRetryAfterBlock !== false) {
    errors.push("Cross-region retry after a block must be disabled");
  }
  if (contactPolicy?.retireAfterRepeatedNoGo !== true) {
    errors.push("Repeated no-go targets must be retired from calibration eligibility");
  }
  for (const state of ["eligible", "cooldown", "blocked", "do_not_calibrate"]) {
    if (!contactPolicy?.eligibilityStates.includes(state)) {
      errors.push(`Missing public-target eligibility state: ${state}`);
    }
  }

  for (const lane of manifest.requiredLanes) {
    if (!manifest.laneDefinitions[lane]) errors.push(`Missing lane definition: ${lane}`);
  }

  for (const target of manifest.targets) {
    if (!target.role) errors.push(`Missing inventory role for ${target.url}`);
    if (target.lanes.length === 0) errors.push(`Missing calibration lanes for ${target.url}`);
    for (const lane of target.lanes) {
      if (!manifest.laneDefinitions[lane]) errors.push(`Unknown lane ${lane} for ${target.url}`);
    }
  }

  for (const lane of manifest.requiredLanes) {
    const covered = manifest.targets.filter((target) => target.lanes.includes(lane)).length;
    if (covered === 0) errors.push(`Required lane has no target-inventory coverage: ${lane}`);
  }

  if (errors.length > 0) {
    console.error("Scan-quality calibration registry failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `Scan-quality calibration registry passed: ${manifest.targets.length} rotating targets, ` +
      `${manifest.requiredLanes.length} stable lanes, ${publicSample.defaultSize}-site default live sample.`,
  );
}

void main();
