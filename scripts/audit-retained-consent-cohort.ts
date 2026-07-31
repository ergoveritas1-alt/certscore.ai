import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalEvidenceBundleSchema,
  deriveConsentSurfaceInspectionOutcome,
} from "../packages/certscore-contracts/src/index.js";

type CohortRow = {
  site: string;
  accessStatus?: string;
  noGo?: boolean;
  accept?: boolean | "unavailable";
  reject?: boolean | "unavailable";
  options?: boolean | "unavailable";
  screenshotPath?: string;
  nanoAgreementAccept?: string;
  nanoAgreementReject?: string;
  nanoAgreementOptions?: string;
};

type GateMetrics = {
  generatedAt: string;
  loadedExactAgreementRate: number;
  perFieldAgreementRate: number;
  loadedSites: number;
  noGoSitesCount: number;
  proofScreenshotsForLoadedSitesRate: number;
  totalSites: number;
  uncertainFields: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  const summary = JSON.parse(await readFile(path.join(root, "final-cohort-summary.json"), "utf8")) as { rows: CohortRow[] };
  const metrics = JSON.parse(await readFile(path.join(root, "aro-nogo-gate-metrics.json"), "utf8")) as GateMetrics;
  const rows = [] as Array<Record<string, unknown>>;
  for (const row of summary.rows) {
    const bundlePath = path.join(root, row.site, "CanonicalEvidenceBundle.json");
    const raw = JSON.parse(await readFile(bundlePath, "utf8"));
    const bundle = canonicalEvidenceBundleSchema.parse(raw);
    const observations = bundle.consentUiObservations;
    const currentDerivedInspection = deriveConsentSurfaceInspectionOutcome({
      cmpRuntimeObservations: bundle.cmpRuntimeObservations,
      consentUiObservations: bundle.consentUiObservations,
      domSnapshots: bundle.domSnapshots,
      modulesRun: bundle.modulesRun,
      networkEvents: bundle.networkEvents,
      runtimeCoverage: bundle.runtimeCoverage,
      screenshots: bundle.screenshots,
      visualCapture: bundle.visualCapture,
    });
    const hasScreenshot = typeof row.screenshotPath === "string" && row.screenshotPath.length > 0;
    const hasActionableObservation = observations.some((observation) =>
      observation.acceptControlObserved || observation.rejectControlObserved || observation.managePreferencesControlObserved,
    );
    rows.push({
      site: row.site,
      loaded: row.accessStatus === "loaded" && row.noGo !== true,
      noGo: row.noGo === true,
      bundleValid: true,
      moduleCompleted: bundle.modulesRun.some((moduleRun) =>
        moduleRun.moduleName === "preConsentRuntimeScanner" && moduleRun.status === "completed",
      ),
      screenshotRetained: hasScreenshot,
      actionableObservationRetained: hasActionableObservation,
      currentDerivedInspection: {
        outcome: currentDerivedInspection.outcome,
        coverageStatus: currentDerivedInspection.coverageStatus,
        inspectionCompleted: currentDerivedInspection.inspectionCompleted,
        evidenceChannels: currentDerivedInspection.evidenceChannels.map((channel) => ({
          channel: channel.channel,
          status: channel.status,
          evidenceCount: channel.evidenceCount,
        })),
      },
      storedAro: {
        accept: row.accept,
        reject: row.reject,
        options: row.options,
      },
      nanoAgreement: {
        accept: row.nanoAgreementAccept,
        reject: row.nanoAgreementReject,
        options: row.nanoAgreementOptions,
      },
      evidenceChannels: observations.length > 0
        ? observations.flatMap((observation) => observation.basis).filter((basis) =>
          /accessibility_tree|geometry|shadow|first_layer|screenshot|inventory/i.test(basis),
        ).slice(0, 12)
        : [],
    });
  }
  const loaded = rows.filter((row) => row.loaded === true);
  const report = {
    reportVersion: "certscore.retained_consent_cohort_audit.1",
    generatedAt: new Date().toISOString(),
    sourceRoot: root,
    currentContractValidation: {
      totalBundles: rows.length,
      validBundles: rows.filter((row) => row.bundleValid === true).length,
      loadedBundles: loaded.length,
      loadedBundlesWithCompletedPreConsent: loaded.filter((row) => row.moduleCompleted === true).length,
      loadedBundlesWithScreenshot: loaded.filter((row) => row.screenshotRetained === true).length,
    },
    adjudicatedGateMetrics: metrics,
    rows,
  };
  await writeFile(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Audited ${rows.length} retained bundles; ${loaded.length} loaded and ${rows.length - loaded.length} no-go.`);
  console.log(`Wrote ${path.resolve(args.out)}`);
}

function parseArgs(argv: string[]) {
  const args = {
    root: "artifacts/consent-control-geometry/2026-06-29-postfix-1c3-adversarial-eu-ie",
    out: "artifacts/retained-consent-cohort-audit-20260723.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--root" && value) { args.root = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
  }
  return args;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
