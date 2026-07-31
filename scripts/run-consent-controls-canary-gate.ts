import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createArtifactWriter } from "../packages/certscore-scan-core/src/artifact-writer.js";
import { getScanProfile } from "../packages/certscore-scan-core/src/profiles.js";
import { preConsentRuntimeScanner } from "../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.js";

type ManifestTarget = {
  key: string;
  url: string;
  accept: boolean;
  reject: boolean;
  options: boolean;
  locale: string;
};

type Manifest = {
  artifactOnly: boolean;
  consentInteractionAllowed: boolean;
  targets: ManifestTarget[];
};

export type ConsentCanaryRow = {
  key: string;
  url: string;
  expected: { accept: boolean; reject: boolean; options: boolean };
  observed: { accept: boolean; reject: boolean; options: boolean };
  exactAgreement: boolean;
  fieldAgreement: { accept: boolean; reject: boolean; options: boolean };
  noGo: boolean;
  status: "completed" | "failed";
  durationMs: number | null;
  timingBreakdown: Array<{ label: string; detail?: string; durationMs: number }>;
  evidenceChannels: Array<{ channel: string; status: string }>;
  artifactDir: string;
  error?: string;
};

export type ConsentCanaryReport = {
  reportVersion: "certscore.consent_controls_canary_gate.1";
  generatedAt: string;
  manifestPath: string;
  baseUrlOverride?: string;
  interactionAllowed: false;
  totals: {
    total: number;
    completed: number;
    failed: number;
    exactAgreement: number;
    exactAgreementRate: number;
    fieldAgreement: { accept: number; reject: number; options: number };
    fieldAgreementRate: { accept: number; reject: number; options: number };
    noGo: number;
    medianDurationMs: number | null;
    p95DurationMs: number | null;
  };
  rows: ConsentCanaryRow[];
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const manifestPath = path.resolve(root, args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (manifest.artifactOnly !== true || manifest.consentInteractionAllowed !== false) {
    throw new Error("Consent canary gate requires artifactOnly=true and consentInteractionAllowed=false.");
  }
  const outDir = path.resolve(root, args.out);
  await mkdir(outDir, { recursive: true });
  const rows: ConsentCanaryRow[] = [];
  for (const target of manifest.targets) {
    const targetUrl = args.baseUrl ? replaceOrigin(target.url, args.baseUrl) : target.url;
    const artifactDir = path.join(outDir, slug(target.key));
    await mkdir(artifactDir, { recursive: true });
    const row = await runTarget({ ...target, url: targetUrl }, artifactDir);
    rows.push(row);
    console.log(`${row.status} ${target.key} exact=${row.exactAgreement} duration=${row.durationMs ?? "—"}ms`);
  }
  const report = buildReport({
    manifestPath,
    baseUrlOverride: args.baseUrl,
    rows,
  });
  await writeFile(path.join(outDir, "consent-controls-canary-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.join(outDir, "consent-controls-canary-gate.json")}`);
  if (args.requireExact && report.totals.exactAgreementRate < 1) {
    throw new Error(`Consent canary exact agreement gate failed: ${report.totals.exactAgreementRate}`);
  }
}

async function runTarget(target: ManifestTarget, artifactDir: string): Promise<ConsentCanaryRow> {
  const startedAtMs = Date.now();
  try {
    const artifactWriter = await createArtifactWriter(artifactDir);
    const result = await preConsentRuntimeScanner({
      url: target.url,
      normalizedUrl: target.url,
      scanStartedAtMs: startedAtMs,
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];
    const observed = {
      accept: observation?.acceptControlObserved === true,
      reject: observation?.rejectControlObserved === true,
      options: observation?.managePreferencesControlObserved === true,
    };
    const expected = { accept: target.accept, reject: target.reject, options: target.options };
    const fieldAgreement = {
      accept: observed.accept === expected.accept,
      reject: observed.reject === expected.reject,
      options: observed.options === expected.options,
    };
    const durationMs = result.moduleRun.durationMs ?? Date.now() - startedAtMs;
    return {
      key: target.key,
      url: target.url,
      expected,
      observed,
      exactAgreement: Object.values(fieldAgreement).every(Boolean),
      fieldAgreement,
      // The pre-consent module does not decide the final scan no-go state;
      // a failed module is the only no-go-equivalent outcome this gate can
      // attribute locally without bypassing the canonical scan assessment.
      noGo: result.moduleRun.status === "failed",
      status: result.moduleRun.status === "failed" ? "failed" : "completed",
      durationMs,
      timingBreakdown: (result.moduleRun.timingBreakdown ?? []).map((timing) => ({
        label: timing.label,
        ...(timing.detail ? { detail: timing.detail } : {}),
        durationMs: timing.durationMs,
      })),
      evidenceChannels: result.consentSurfaceInspection?.evidenceChannels?.map((channel) => ({
        channel: channel.channel,
        status: channel.status,
      })) ?? [],
      artifactDir,
      error: result.moduleRun.errors.join("; ") || undefined,
    };
  } catch (error) {
    return {
      key: target.key,
      url: target.url,
      expected: { accept: target.accept, reject: target.reject, options: target.options },
      observed: { accept: false, reject: false, options: false },
      exactAgreement: false,
      fieldAgreement: { accept: false, reject: false, options: false },
      noGo: true,
      status: "failed",
      durationMs: Date.now() - startedAtMs,
      timingBreakdown: [],
      evidenceChannels: [],
      artifactDir,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildReport(input: {
  manifestPath: string;
  baseUrlOverride?: string;
  rows: ConsentCanaryRow[];
}): ConsentCanaryReport {
  const completedRows = input.rows.filter((row) => row.status === "completed");
  const durations = completedRows
    .map((row) => row.durationMs)
    .filter((duration): duration is number => duration !== null)
    .sort((a, b) => a - b);
  const fieldAgreement = {
    accept: input.rows.filter((row) => row.fieldAgreement.accept).length,
    reject: input.rows.filter((row) => row.fieldAgreement.reject).length,
    options: input.rows.filter((row) => row.fieldAgreement.options).length,
  };
  const total = input.rows.length;
  return {
    reportVersion: "certscore.consent_controls_canary_gate.1",
    generatedAt: new Date().toISOString(),
    manifestPath: input.manifestPath,
    ...(input.baseUrlOverride ? { baseUrlOverride: input.baseUrlOverride } : {}),
    interactionAllowed: false,
    totals: {
      total,
      completed: completedRows.length,
      failed: input.rows.length - completedRows.length,
      exactAgreement: input.rows.filter((row) => row.exactAgreement).length,
      exactAgreementRate: total === 0 ? 0 : input.rows.filter((row) => row.exactAgreement).length / total,
      fieldAgreement,
      fieldAgreementRate: {
        accept: total === 0 ? 0 : fieldAgreement.accept / total,
        reject: total === 0 ? 0 : fieldAgreement.reject / total,
        options: total === 0 ? 0 : fieldAgreement.options / total,
      },
      noGo: input.rows.filter((row) => row.noGo).length,
      medianDurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
    },
    rows: input.rows,
  };
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? null;
}

function replaceOrigin(url: string, baseUrl: string): string {
  const source = new URL(url);
  const base = new URL(baseUrl);
  return new URL(`${source.pathname}${source.search}${source.hash}`, base).toString();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "target";
}

function parseArgs(argv: string[]) {
  const args = {
    manifest: "docs/certscore-v2/consent-controls-live-canaries.json",
    out: "artifacts/consent-controls-canary-gate",
    baseUrl: undefined as string | undefined,
    requireExact: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--manifest" && value) { args.manifest = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
    else if (arg === "--base-url" && value) { args.baseUrl = value; index += 1; }
    else if (arg === "--require-exact") { args.requireExact = true; }
  }
  return args;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
