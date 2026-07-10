import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, type SupportedPrivacyEvidenceLocale } from "@certscore/contracts";

type Expectation = "required" | "not_expected" | "unknown";
type Target = {
  key: string;
  locale: SupportedPrivacyEvidenceLocale;
  controlLocale?: SupportedPrivacyEvidenceLocale;
  url: string;
  artifactDir?: string;
  expectations: {
    privacyPolicy: Expectation;
    cookiePolicy: Expectation;
    accept: Expectation;
    reject: Expectation;
    options: Expectation;
    privacyChoices?: Expectation;
    privacyOptOut?: Expectation;
  };
};
type Manifest = { version: "certscore.multilingual_live_calibration.1"; targets: Target[] };

type Args = { manifest: string; artifactRoot: string; out: string; strict: boolean };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.manifest, "utf8")) as Manifest;
  if (manifest.version !== "certscore.multilingual_live_calibration.1") {
    throw new Error("Unsupported multilingual live-calibration manifest version.");
  }
  const rows = await Promise.all(manifest.targets.map((target) => summarizeTarget(target, args.artifactRoot)));
  const failures = rows.filter((row) =>
    row.status === "failed" ||
    row.status === "missing_artifact" ||
    row.checks.some((check) => check.status === "missed")
  );
  const report = {
    reportVersion: "certscore.multilingual_live_calibration_report.1",
    generatedAt: new Date().toISOString(),
    manifest: path.resolve(args.manifest),
    artifactRoot: path.resolve(args.artifactRoot),
    totals: {
      targets: rows.length,
      evaluated: rows.filter((row) => row.status === "evaluated").length,
      missingArtifacts: rows.filter((row) => row.status === "missing_artifact").length,
      failed: rows.filter((row) => row.status === "failed").length,
      missedChecks: rows.reduce((count, row) => count + row.checks.filter((check) => check.status === "missed").length, 0),
    },
    rows,
  };
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, "MultilingualPrivacyEvidenceLiveCalibration.report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(args.out, "MultilingualPrivacyEvidenceLiveCalibration.report.md"), markdownFor(report));
  console.log(`Wrote ${path.join(args.out, "MultilingualPrivacyEvidenceLiveCalibration.report.md")}`);
  if (args.strict && failures.length > 0) process.exitCode = 1;
}

async function summarizeTarget(target: Target, artifactRoot: string) {
  const artifactDir = path.resolve(artifactRoot, target.artifactDir ?? target.key);
  const bundlePath = path.join(artifactDir, "CanonicalEvidenceBundle.json");
  try {
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(bundlePath, "utf8")));
    const controls = bundle.consentUiObservations.flatMap((observation) => observation.controls);
    const expectedControlLocale = target.controlLocale ?? target.locale;
    const observed = {
      privacyPolicy: bundle.policySurfaceObservations.some((surface) => surface.surfaceType === "privacy_policy" && surface.status === "fetched"),
      cookiePolicy: bundle.policySurfaceObservations.some((surface) => surface.surfaceType === "cookie_policy" && surface.status === "fetched"),
      accept: controls.some((control) => control.actionType === "accept_all" && control.matchedLocale === expectedControlLocale),
      reject: controls.some((control) => control.actionType === "reject_all" && control.matchedLocale === expectedControlLocale),
      options: controls.some((control) => control.actionType === "manage_preferences" && control.matchedLocale === expectedControlLocale),
      privacyChoices: bundle.policySurfaceObservations.some((surface) => surface.surfaceType === "your_privacy_choices" && surface.status === "fetched"),
      privacyOptOut: controls.some((control) => control.actionType === "do_not_sell_share" && control.matchedLocale === expectedControlLocale),
    };
    return {
      key: target.key, locale: target.locale, url: target.url, artifactDir, status: "evaluated" as const,
      checks: (Object.keys(target.expectations) as Array<keyof typeof target.expectations>).map((key) => ({
        key, expected: target.expectations[key], observed: observed[key],
        status: target.expectations[key] === "unknown" ? "not_scored" :
          target.expectations[key] === "required" === observed[key] ? "pass" : "missed",
      })),
    };
  } catch (error) {
    const code = error instanceof Error && /ENOENT/.test(error.message) ? "missing_artifact" : "failed";
    return { key: target.key, locale: target.locale, url: target.url, artifactDir, status: code, checks: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function markdownFor(report: { totals: Record<string, number>; rows: Array<{ key: string; locale: string; status: string; checks: Array<{ key: string; status: string }> }> }) {
  const lines = ["# Multilingual privacy-evidence live calibration", "", `- Evaluated: ${report.totals.evaluated}/${report.totals.targets}`, `- Missing artifacts: ${report.totals.missingArtifacts}`, `- Missed checks: ${report.totals.missedChecks}`, "", "| Target | Locale | Status | Missed checks |", "| --- | --- | --- | --- |"];
  for (const row of report.rows) lines.push(`| ${row.key} | ${row.locale} | ${row.status} | ${row.checks.filter((check) => check.status === "missed").map((check) => check.key).join(", ") || "—"} |`);
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => argv[argv.indexOf(flag) + 1];
  const manifest = value("--manifest");
  const artifactRoot = value("--artifact-root");
  if (!manifest || !artifactRoot) throw new Error("Usage: pnpm v2:multilingual-live-calibration -- --manifest <manifest.json> --artifact-root <artifact-dir> [--out <dir>] [--strict]");
  return { manifest, artifactRoot, out: value("--out") ?? path.join(artifactRoot, "multilingual-live-calibration"), strict: argv.includes("--strict") };
}

void main();
