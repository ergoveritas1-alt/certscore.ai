import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalEvidenceBundleSchema,
  SUPPORTED_GDPR_TRANSPARENCY_LOCALES,
  type GdprTransparencyTopic,
  type SupportedGdprTransparencyLocale,
} from "@certscore/contracts";

type Target = { key: string; locale: SupportedGdprTransparencyLocale; url: string; artifactDir?: string };
type Manifest = {
  version: "certscore.gdpr_transparency_live_calibration.1";
  artifactOnly: true;
  consentInteractionAllowed: false;
  expectedTopics: GdprTransparencyTopic[];
  targets: Target[];
};
type Args = { manifest: string; artifactRoot: string; out: string; strict: boolean };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.manifest, "utf8")) as Manifest;
  validateManifest(manifest);
  const rows = await Promise.all(manifest.targets.map((target) => summarizeTarget(target, manifest.expectedTopics, args.artifactRoot)));
  const report = {
    reportVersion: "certscore.gdpr_transparency_live_calibration_report.1",
    generatedAt: new Date().toISOString(),
    manifest: path.resolve(args.manifest),
    artifactRoot: path.resolve(args.artifactRoot),
    totals: {
      targets: rows.length,
      passed: rows.filter((row) => row.status === "passed").length,
      missedTopics: rows.reduce((sum, row) => sum + row.missedTopics.length, 0),
      missingArtifacts: rows.filter((row) => row.status === "missing_artifact").length,
      failed: rows.filter((row) => row.status === "failed").length,
    },
    rows,
  };
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, "GdprTransparencyMultilingualLiveCalibration.report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(args.out, "GdprTransparencyMultilingualLiveCalibration.report.md"), markdownFor(report));
  console.log(`Wrote ${path.join(args.out, "GdprTransparencyMultilingualLiveCalibration.report.md")}`);
  if (args.strict && rows.some((row) => row.status !== "passed")) process.exitCode = 1;
}

async function summarizeTarget(target: Target, expectedTopics: GdprTransparencyTopic[], artifactRoot: string) {
  const artifactDir = path.resolve(artifactRoot, target.artifactDir ?? target.key);
  try {
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(path.join(artifactDir, "CanonicalEvidenceBundle.json"), "utf8")));
    const surfaces = bundle.policySurfaceObservations.filter((surface) =>
      surface.surfaceType === "privacy_policy" && surface.status === "fetched"
    );
    const allCandidates = surfaces.flatMap((surface) => surface.gdprTransparencyTopicCandidates);
    const matchingCandidates = allCandidates.filter((candidate) => candidate.matchedLocale === target.locale);
    const observedTopics = [...new Set(matchingCandidates.map((candidate) => candidate.topic))];
    const missedTopics = expectedTopics.filter((topic) => !observedTopics.includes(topic));
    const evidenceExcerptsBounded = matchingCandidates.every((candidate) =>
      candidate.evidenceText.length > 0 && candidate.evidenceText.length <= 360
    );
    const wrongLocaleTopics = [...new Set(allCandidates
      .filter((candidate) => candidate.matchedLocale !== target.locale)
      .map((candidate) => candidate.topic))];
    return {
      key: target.key,
      locale: target.locale,
      url: target.url,
      artifactDir,
      status: surfaces.length === 0
        ? "privacy_policy_not_fetched" as const
        : missedTopics.length > 0
          ? "missed_topics" as const
          : !evidenceExcerptsBounded
            ? "invalid_evidence_excerpt" as const
            : "passed" as const,
      observedTopics,
      missedTopics,
      wrongLocaleTopics,
      evidenceExcerptsBounded,
    };
  } catch (error) {
    const status = error instanceof Error && /ENOENT/.test(error.message) ? "missing_artifact" as const : "failed" as const;
    return { key: target.key, locale: target.locale, url: target.url, artifactDir, status, observedTopics: [], missedTopics: expectedTopics, wrongLocaleTopics: [], evidenceExcerptsBounded: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function validateManifest(manifest: Manifest) {
  if (manifest.version !== "certscore.gdpr_transparency_live_calibration.1" || manifest.artifactOnly !== true || manifest.consentInteractionAllowed !== false) {
    throw new Error("Invalid GDPR Transparency live-calibration manifest safety contract.");
  }
  const locales = new Set<string>(SUPPORTED_GDPR_TRANSPARENCY_LOCALES);
  for (const target of manifest.targets) if (!locales.has(target.locale)) throw new Error(`Unsupported target locale: ${target.locale}`);
}

function markdownFor(report: { totals: Record<string, number>; rows: Array<{ key: string; locale: string; status: string; missedTopics: string[]; wrongLocaleTopics: string[] }> }) {
  const lines = [
    "# GDPR Transparency multilingual live calibration",
    "",
    `- Passed: ${report.totals.passed}/${report.totals.targets}`,
    `- Missing artifacts: ${report.totals.missingArtifacts}`,
    `- Missed topics: ${report.totals.missedTopics}`,
    "",
    "| Target | Locale | Status | Missed topics | Other-locale topics |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of report.rows) lines.push(`| ${row.key} | ${row.locale} | ${row.status} | ${row.missedTopics.join(", ") || "—"} | ${row.wrongLocaleTopics.join(", ") || "—"} |`);
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => argv[argv.indexOf(flag) + 1];
  const manifest = value("--manifest");
  const artifactRoot = value("--artifact-root");
  if (!manifest || !artifactRoot) throw new Error("Usage: pnpm v2:gdpr-transparency-live-calibration -- --manifest <manifest.json> --artifact-root <artifact-dir> [--out <dir>] [--strict]");
  return { manifest, artifactRoot, out: value("--out") ?? path.join(artifactRoot, "gdpr-transparency-live-calibration"), strict: argv.includes("--strict") };
}

void main();
