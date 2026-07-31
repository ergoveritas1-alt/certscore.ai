import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceBundleSchema,
  consentControlGeometryHumanReviewCorpusSchema,
  type ConsentControlAssessment,
} from "../packages/certscore-contracts/src/index.js";
import {
  deriveMaterializedConsentControlAssessment,
} from "../apps/web/server/scans/consent-control-assessment-projector.js";

type Field = "accept" | "reject" | "options";
type State = ConsentControlAssessment["controls"]["accept"]["state"];

export type ConsentHumanReviewComparisonRow = {
  scanId: string;
  website: string;
  expected: Record<Field, State>;
  actual: Record<Field, State>;
  disagreements: Field[];
  eligible: boolean;
  eligibilityReasons: string[];
  proofScreenshot: string | null;
  assessmentStatus: ConsentControlAssessment["assessmentStatus"] | null;
  documentIdentityStatus: ConsentControlAssessment["document"]["identityStatus"] | null;
  surfaceStatus: ConsentControlAssessment["surface"]["status"] | null;
  limitationCodes: string[];
  error: string | null;
};

const FIELDS: Field[] = ["accept", "reject", "options"];

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function blankConfusion() {
  return {
    observed: { observed: 0, not_observed: 0, unknown: 0 },
    not_observed: { observed: 0, not_observed: 0, unknown: 0 },
    unknown: { observed: 0, not_observed: 0, unknown: 0 },
  } satisfies Record<State, Record<State, number>>;
}

export function computeConsentHumanReviewMetrics(rows: ConsentHumanReviewComparisonRow[]) {
  const eligible = rows.filter((row) => row.eligible);
  const perField = Object.fromEntries(FIELDS.map((field) => {
    const confusion = blankConfusion();
    for (const row of eligible) {
      confusion[row.expected[field]][row.actual[field]] += 1;
    }
    const exact = eligible.filter((row) => row.expected[field] === row.actual[field]).length;
    const expectedObserved = eligible.filter((row) => row.expected[field] === "observed");
    const actualObservedComparable = eligible.filter((row) =>
      row.expected[field] !== "unknown" && row.actual[field] === "observed"
    );
    const trueObserved = expectedObserved.filter((row) => row.actual[field] === "observed").length;
    const falseObserved = eligible.filter((row) =>
      row.expected[field] === "not_observed" && row.actual[field] === "observed"
    ).length;
    return [field, {
      rows: eligible.length,
      exactAgreement: ratio(exact, eligible.length),
      observedRecall: ratio(trueObserved, expectedObserved.length),
      falsePositiveControlClaimRate: ratio(falseObserved, actualObservedComparable.length),
      confusion,
    }];
  })) as Record<Field, {
    rows: number;
    exactAgreement: number | null;
    observedRecall: number | null;
    falsePositiveControlClaimRate: number | null;
    confusion: Record<State, Record<State, number>>;
  }>;
  const exactRows = eligible.filter((row) => row.disagreements.length === 0).length;
  return {
    totalRows: rows.length,
    eligibleRows: eligible.length,
    excludedRows: rows.length - eligible.length,
    exactAroAgreement: ratio(exactRows, eligible.length),
    proofScreenshotCoverage: ratio(
      eligible.filter((row) => row.proofScreenshot !== null).length,
      eligible.length,
    ),
    perField,
  };
}

function parseArgs(argv: string[]) {
  const args = {
    artifactsRoot: "artifacts/local-v2-dag-scans",
    corpus: "packages/certscore-contracts/fixtures/consent-geometry-human-review.v1.json",
    out: "artifacts/consent-geometry-human-review-verification.json",
    minRows: 15,
    minAgreement: 0.95,
    minRecall: 0.95,
    maxFalsePositiveRate: 0.01,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--artifacts-root" && value) { args.artifactsRoot = value; index += 1; }
    else if (flag === "--corpus" && value) { args.corpus = value; index += 1; }
    else if (flag === "--out" && value) { args.out = value; index += 1; }
    else if (flag === "--min-rows" && value) { args.minRows = Number(value); index += 1; }
    else if (flag === "--min-agreement" && value) { args.minAgreement = Number(value); index += 1; }
    else if (flag === "--min-recall" && value) { args.minRecall = Number(value); index += 1; }
    else if (flag === "--max-false-positive-rate" && value) {
      args.maxFalsePositiveRate = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
  }
  return args;
}

function noGo(bundle: ReturnType<typeof canonicalEvidenceBundleSchema.parse>) {
  return bundle.scanNoGoAssessment?.decision === "no_go" ||
    bundle.visualAccessReview?.go_no_go === "NO_GO";
}

function state(value: ConsentControlAssessment["controls"][Field]["state"]): State {
  return value;
}

async function firstExisting(paths: string[]) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next retained proof filename.
    }
  }
  return null;
}

async function compareRow(
  artifactsRoot: string,
  row: ReturnType<typeof consentControlGeometryHumanReviewCorpusSchema.parse>["rows"][number],
): Promise<ConsentHumanReviewComparisonRow> {
  const artifactDir = path.join(artifactsRoot, row.scanId);
  const bundlePath = path.join(artifactDir, "CanonicalEvidenceBundle.json");
  const geometryPath = path.join(artifactDir, "ConsentControlGeometryEvidence.json");
  const proofScreenshot = await firstExisting([
    path.join(artifactDir, "screenshot-pre-consent-geometry-proof.png"),
    path.join(artifactDir, "screenshot-pre-consent-cmp-controls.png"),
    path.join(artifactDir, "screenshot-pre-consent.png"),
  ]);
  try {
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(bundlePath, "utf8")));
    const geometry = JSON.parse(await readFile(geometryPath, "utf8")) as Record<string, unknown>;
    const assessment = deriveMaterializedConsentControlAssessment({
      bundle,
      consentControlGeometryEvidence: geometry,
      consentSurfaceInspection: bundle.consentSurfaceInspection,
      finalUrl: bundle.domSnapshots.at(-1)?.url ?? bundle.normalizedUrl ?? bundle.url,
      noGo: noGo(bundle),
      noGoReasonCodes: bundle.scanNoGoAssessment?.reasonCodes ?? [],
      requestedUrl: bundle.url,
      scanId: bundle.scanId,
    });
    const expected = row.adjudicated;
    const actual = {
      accept: state(assessment.controls.accept.state),
      reject: state(assessment.controls.reject.state),
      options: state(assessment.controls.options.state),
    };
    const disagreements = FIELDS.filter((field) => expected[field] !== actual[field]);
    const eligibilityReasons = [
      ...(row.documentMatch !== "yes" ? ["human_document_match_not_yes"] : []),
      ...(proofScreenshot ? [] : ["retained_proof_screenshot_missing"]),
      ...(assessment.document.identityStatus !== "matched"
        ? [`assessment_document_${assessment.document.identityStatus}`]
        : []),
      ...(assessment.scan.noGo ? ["scan_no_go"] : []),
    ];
    return {
      scanId: row.scanId,
      website: row.website,
      expected,
      actual,
      disagreements,
      eligible: eligibilityReasons.length === 0,
      eligibilityReasons,
      proofScreenshot,
      assessmentStatus: assessment.assessmentStatus,
      documentIdentityStatus: assessment.document.identityStatus,
      surfaceStatus: assessment.surface.status,
      limitationCodes: assessment.limitations.map((limitation) => limitation.code),
      error: null,
    };
  } catch (error) {
    return {
      scanId: row.scanId,
      website: row.website,
      expected: row.adjudicated,
      actual: { accept: "unknown", reject: "unknown", options: "unknown" },
      disagreements: [...FIELDS],
      eligible: false,
      eligibilityReasons: ["artifact_read_or_projection_failed"],
      proofScreenshot,
      assessmentStatus: null,
      documentIdentityStatus: null,
      surfaceStatus: null,
      limitationCodes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusPath = path.resolve(args.corpus);
  const artifactsRoot = path.resolve(args.artifactsRoot);
  const out = path.resolve(args.out);
  const corpus = consentControlGeometryHumanReviewCorpusSchema.parse(
    JSON.parse(await readFile(corpusPath, "utf8")),
  );
  const rows: ConsentHumanReviewComparisonRow[] = [];
  for (const row of corpus.rows) {
    rows.push(await compareRow(artifactsRoot, row));
  }
  const metrics = computeConsentHumanReviewMetrics(rows);
  const checks = {
    minimumRows: metrics.eligibleRows >= args.minRows,
    exactAroAgreement: (metrics.exactAroAgreement ?? 0) >= args.minAgreement,
    perFieldAgreement: FIELDS.every((field) =>
      (metrics.perField[field].exactAgreement ?? 0) >= args.minAgreement
    ),
    perFieldObservedRecall: FIELDS.every((field) =>
      (metrics.perField[field].observedRecall ?? 0) >= args.minRecall
    ),
    falsePositiveControlClaims: FIELDS.every((field) =>
      (metrics.perField[field].falsePositiveControlClaimRate ?? 1) <= args.maxFalsePositiveRate
    ),
    proofScreenshotCoverage: metrics.proofScreenshotCoverage === 1,
  };
  const report = {
    artifactType: "consent_geometry_human_review_verification",
    artifactVersion: "1.0",
    generatedAt: new Date().toISOString(),
    calibrationOnly: true,
    releaseGateEligible: false,
    provenance: {
      corpus: path.relative(process.cwd(), corpusPath),
      corpusReviewMethod: corpus.reviewMethod,
      independentlyReviewed: corpus.independentlyReviewed,
      evidenceOnlyReview: corpus.evidenceOnlyReview,
      artifactsRoot: path.relative(process.cwd(), artifactsRoot),
    },
    thresholds: {
      minRows: args.minRows,
      minAgreement: args.minAgreement,
      minRecall: args.minRecall,
      maxFalsePositiveRate: args.maxFalsePositiveRate,
    },
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
    checks,
    metrics,
    rows,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    out,
    status: report.status,
    checks,
    metrics,
    disagreements: rows.filter((row) => row.eligible && row.disagreements.length > 0)
      .map((row) => ({ scanId: row.scanId, website: row.website, fields: row.disagreements })),
    excluded: rows.filter((row) => !row.eligible)
      .map((row) => ({ scanId: row.scanId, website: row.website, reasons: row.eligibilityReasons })),
  }, null, 2));
  if (report.status === "fail") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
