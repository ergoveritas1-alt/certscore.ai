import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { consentControlHumanAdjudicationCorpusSchema } from "../packages/certscore-contracts/src/index";

export type ConsentState = "observed" | "not_observed" | "unknown";
type Aro = { accept: ConsentState; reject: ConsentState; options: ConsentState };
type Field = keyof Aro;

type WorksheetRow = Record<string, string>;
type EvidenceRecord = Record<string, unknown>;

export type CalibrationRow = {
  reviewId: string;
  scanId: string;
  website: string;
  proposed: Aro;
  adjudicated: Aro | null;
  override: string | null;
  documentMatch: "yes" | "no" | "unknown";
  notes: string | null;
  disposition: "included" | "pending" | "excluded";
  releaseGateEligible: boolean;
  releaseGateReasons: string[];
  dispositionReasons: string[];
  disagreements: Field[];
  evidence: {
    artifactPath: string | null;
    sha256: string | null;
    scanId: string | null;
    domain: string | null;
    completedAt: string | null;
    cmpVendor: string | null;
    accessPosture: string | null;
    language: string | null;
    noGo: boolean | null;
    homepageFetchStatus: string | null;
    verifiedPublicSurfacesCount: number | null;
    pagesScanned: number | null;
    retainedVisualProof: boolean;
  };
  provenance: {
    labelClass: "human_adjudication_candidate";
    reviewMethod: "live_chrome_incognito_eu_ir_vpn";
    reviewerRole: "product_owner";
    reviewerAttestedLiveObservation: true;
    independentlyReviewed: false;
    evidenceOnlyReview: false;
    sourceWorksheetSha256: string;
    labelHash: string | null;
  };
};

const FIELDS: Field[] = ["accept", "reject", "options"];
const STATES: ConsentState[] = ["observed", "not_observed", "unknown"];

function parseArgs(argv: string[]) {
  const args = {
    worksheet: "artifacts/consent-control-review-human-eu-ir-20260727.csv",
    evidenceRoot: "artifacts/public-evidence-corpus-cache",
    outDir: "artifacts/consent-control-calibration-20260727",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--worksheet" && value) { args.worksheet = value; index += 1; }
    else if (arg === "--evidence-root" && value) { args.evidenceRoot = value; index += 1; }
    else if (arg === "--out-dir" && value) { args.outDir = value; index += 1; }
  }
  return args;
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\"") {
      if (quoted && input[index + 1] === "\"") { value += "\""; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function worksheetRows(input: string): WorksheetRow[] {
  const [header = [], ...rows] = parseCsv(input);
  return rows.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function state(value: string): ConsentState | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "observed") return "observed";
  if (normalized === "not observed") return "not_observed";
  if (normalized === "unknown") return "unknown";
  return null;
}

function proposed(row: WorksheetRow): Aro | null {
  const accept = state(row["Proposed Accept"] ?? "");
  const reject = state(row["Proposed Reject"] ?? "");
  const options = state(row["Proposed Options"] ?? "");
  return accept && reject && options ? { accept, reject, options } : null;
}

function adjudicated(row: WorksheetRow, proposedAro: Aro): { aro: Aro | null; reasons: string[] } {
  const override = (row.Override ?? "").trim();
  if (!override) return { aro: null, reasons: ["override_pending"] };
  if (override === "Accept recommendation") return { aro: proposedAro, reasons: [] };
  if (override !== "Change recommendation") return { aro: null, reasons: ["override_invalid"] };
  const accept = state(row["Your Accept"] ?? "");
  const reject = state(row["Your Reject"] ?? "");
  const options = state(row["Your Options"] ?? "");
  return accept && reject && options
    ? { aro: { accept, reject, options }, reasons: [] }
    : { aro: null, reasons: ["changed_decision_incomplete"] };
}

function documentMatch(value: string): CalibrationRow["documentMatch"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "unknown";
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function host(value: string | null) {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return value.toLowerCase().replace(/^www\./, ""); }
}

function nested(record: EvidenceRecord, ...keys: string[]) {
  let value: unknown = record;
  for (const key of keys) {
    if (!value || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function evidenceReference(row: WorksheetRow, evidenceRoot: string) {
  const reference = (row["Bundle artifact"] ?? "").trim();
  if (!reference) return { path: null, reason: "evidence_reference_missing" };
  const resolved = path.resolve(reference);
  const relative = path.relative(evidenceRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { path: null, reason: "evidence_reference_outside_root" };
  return { path: resolved, reason: null };
}

function blankConfusion() {
  return Object.fromEntries(STATES.map((actual) => [
    actual,
    Object.fromEntries(STATES.map((predicted) => [predicted, 0])),
  ])) as Record<ConsentState, Record<ConsentState, number>>;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function metrics(rows: CalibrationRow[], releaseGateOnly = false) {
  const included = rows.filter((row): row is CalibrationRow & { adjudicated: Aro } =>
    row.disposition === "included" &&
    row.adjudicated !== null &&
    (!releaseGateOnly || row.releaseGateEligible));
  type FieldMetrics = {
    rows: number;
    exactAgreement: number | null;
    observedPrecision: number | null;
    observedRecall: number | null;
    falsePositiveControlClaimRate: number | null;
    confusion: Record<ConsentState, Record<ConsentState, number>>;
  };
  const perField = {} as Record<Field, FieldMetrics>;
  for (const field of FIELDS) {
    const confusion = blankConfusion();
    for (const row of included) confusion[row.adjudicated[field]][row.proposed[field]] += 1;
    const exact = included.filter((row) => row.adjudicated[field] === row.proposed[field]).length;
    const observedComparable = included.filter((row) => row.adjudicated[field] !== "unknown");
    const predictedObservedComparable = observedComparable.filter((row) => row.proposed[field] === "observed");
    const actualObserved = included.filter((row) => row.adjudicated[field] === "observed");
    const trueObserved = included.filter((row) => row.adjudicated[field] === "observed" && row.proposed[field] === "observed").length;
    const falseObserved = included.filter((row) => row.adjudicated[field] === "not_observed" && row.proposed[field] === "observed").length;
    perField[field] = {
      rows: included.length,
      exactAgreement: ratio(exact, included.length),
      observedPrecision: ratio(trueObserved, predictedObservedComparable.length),
      observedRecall: ratio(trueObserved, actualObserved.length),
      falsePositiveControlClaimRate: ratio(falseObserved, predictedObservedComparable.length),
      confusion,
    };
  }
  const exactRows = included.filter((row) => FIELDS.every((field) => row.adjudicated[field] === row.proposed[field])).length;
  const segment = (selector: (row: CalibrationRow) => string) => Object.fromEntries(
    [...new Set(included.map(selector))].sort().map((key) => {
      const matching = included.filter((row) => selector(row) === key);
      const exact = matching.filter((row) => row.disagreements.length === 0).length;
      return [key, { rows: matching.length, exactAgreement: ratio(exact, matching.length) }];
    }),
  );
  const observedPrecisionValues = FIELDS.map((field) => perField[field].observedPrecision);
  const perFieldAgreementValues = FIELDS.map((field) => perField[field].exactAgreement);
  const falsePositiveValues = FIELDS.map((field) => perField[field].falsePositiveControlClaimRate);
  return {
    includedRows: included.length,
    exactAroAgreement: ratio(exactRows, included.length),
    perField,
    segments: {
      cmpVendor: segment((row) => row.evidence.cmpVendor ?? "not_recorded"),
      accessPosture: segment((row) => row.evidence.accessPosture ?? "not_recorded"),
      language: segment((row) => row.evidence.language ?? "not_recorded"),
    },
    gates: {
      minimumRows: { required: 100, actual: included.length, passed: included.length >= 100 },
      observedPrecision95: {
        required: 0.95,
        passed: observedPrecisionValues.every((value) => value !== null && value >= 0.95),
      },
      perFieldAgreement95: {
        required: 0.95,
        actual: Object.fromEntries(FIELDS.map((field) => [field, perField[field].exactAgreement])),
        passed: perFieldAgreementValues.every((value) => value !== null && value >= 0.95),
      },
      falsePositiveControlClaims1: {
        maximum: 0.01,
        actual: Object.fromEntries(FIELDS.map((field) => [field, perField[field].falsePositiveControlClaimRate])),
        passed: falsePositiveValues.every((value) => value !== null && value <= 0.01),
      },
      exactAro95: {
        required: 0.95,
        actual: ratio(exactRows, included.length),
        passed: included.length > 0 && exactRows / included.length >= 0.95,
      },
    },
  };
}

function disagreementCategory(proposedState: ConsentState, actualState: ConsentState) {
  if (proposedState === actualState) return null;
  if (proposedState === "not_observed" && actualState === "observed") return "false_absence_critical";
  if (proposedState === "unknown" && actualState === "observed") return "capture_or_projection_miss";
  if (proposedState === "observed" && actualState === "not_observed") return "false_positive_or_live_state_drift";
  if (proposedState === "not_observed" && actualState === "unknown") return "unsupported_absence";
  if (proposedState === "observed" && actualState === "unknown") return "human_inconclusive_conflict";
  return "coverage_or_state_reconciliation_gap";
}

export function rootCauseInventory(rows: CalibrationRow[]) {
  const disagreements = rows.flatMap((row) => row.disposition === "included" && row.adjudicated
    ? FIELDS.flatMap((field) => {
        const category = disagreementCategory(row.proposed[field], row.adjudicated![field]);
        return category ? [{
          reviewId: row.reviewId,
          scanId: row.scanId,
          website: row.website,
          field,
          proposed: row.proposed[field],
          adjudicated: row.adjudicated![field],
          category,
          evidence: row.evidence,
          nextTraceStage: "retained_raw_evidence_required",
        }] : [];
      })
    : []);
  return {
    disagreementFields: disagreements.length,
    rowsWithDisagreement: new Set(disagreements.map((row) => row.reviewId)).size,
    categories: Object.fromEntries([...new Set(disagreements.map((row) => row.category))].sort().map((category) => [
      category,
      disagreements.filter((row) => row.category === category).length,
    ])),
    coverageLeads: {
      scannerAccessCoverageGap: rows.filter((row) => row.releaseGateReasons.includes("scanner_access_limited")).length,
      retainedVisualProofMissing: rows.filter((row) => row.releaseGateReasons.includes("retained_visual_proof_missing")).length,
      loadedDocumentUnverified: rows.filter((row) => row.releaseGateReasons.includes("loaded_document_unverified")).length,
    },
    restrictions: {
      displayOnlyFixesAllowed: false,
      classifierChangesWithoutRawLabelsAllowed: false,
      unknownMayBecomeFalse: false,
      miniMayCreateAbsence: false,
    },
    disagreements,
  };
}

export function rawEvidenceRetrievalManifest(rows: CalibrationRow[]) {
  const candidates = rows
    .filter((row) => row.disposition === "included" && (row.disagreements.length > 0 || row.releaseGateReasons.length > 0))
    .map((row) => {
      const criticalFalseAbsence = row.adjudicated && FIELDS.some((field) =>
        row.proposed[field] === "not_observed" && row.adjudicated![field] === "observed");
      return {
        scanId: row.scanId,
        website: row.website,
        publicEvidenceArtifact: row.evidence.artifactPath,
        publicEvidenceSha256: row.evidence.sha256,
        priority: criticalFalseAbsence ? 1 : row.disagreements.length > 0 ? 2 : 3,
        disagreementFields: row.disagreements,
        releaseGateReasons: row.releaseGateReasons,
        requiredArtifacts: [
          "CanonicalEvidenceBundle.json",
          "ConsentControlGeometryEvidence.json",
          "pre-consent screenshot or equivalent visual proof",
          "LocalV2DagLambdaManifest.json or equivalent scan provenance",
        ],
        requiredChecks: [
          "final document identity",
          "first-layer visibility and actionability",
          "observation timestamps",
          "capture completeness and no-go state",
          "canonical label-classifier evidence and reason codes",
        ],
      };
    })
    .sort((left, right) => left.priority - right.priority || left.scanId.localeCompare(right.scanId));
  return {
    artifactType: "consent_control_raw_evidence_retrieval_manifest",
    artifactVersion: "1.0",
    generatedAt: new Date().toISOString(),
    decision: "blocked_pending_raw_evidence_binding",
    rows: candidates.length,
    candidates,
  };
}

export function miniShadowPacket(rows: CalibrationRow[]) {
  const candidates = rows
    .filter((row) => row.releaseGateEligible && row.disagreements.length > 0)
    .map((row) => ({
      scanId: row.scanId,
      website: row.website,
      evidenceSha256: row.evidence.sha256,
      disagreementFields: row.disagreements,
      allowedTask: "bounded translation or semantic-conflict review",
    }));
  return {
    artifactType: "consent_control_mini_shadow_packet",
    artifactVersion: "1.0",
    generatedAt: new Date().toISOString(),
    mode: "shadow",
    productionProjectable: false,
    decision: candidates.length > 0 ? "ready_for_bounded_shadow_review" : "blocked_pending_raw_evidence_binding",
    invariants: {
      mayCreateAbsence: false,
      mayConvertUnknownToNotObserved: false,
      mayOverrideDeterministicObservedEvidence: false,
      requiresEvidenceHash: true,
      requiresStrictTypedOutput: true,
    },
    candidates,
  };
}

export async function buildCalibrationCorpus(input: {
  worksheetText: string;
  worksheetSha256: string;
  evidenceRoot: string;
}) {
  const rows: CalibrationRow[] = [];
  for (const worksheetRow of worksheetRows(input.worksheetText)) {
    const proposedAro = proposed(worksheetRow);
    if (!proposedAro) continue;
    const adjudication = adjudicated(worksheetRow, proposedAro);
    const match = documentMatch(worksheetRow["Your Document Match"] ?? "");
    const reasons = [...adjudication.reasons];
    if (match === "no") reasons.push("document_mismatch");
    else if (match === "unknown") reasons.push("document_match_unresolved");
    const reference = evidenceReference(worksheetRow, input.evidenceRoot);
    if (reference.reason) reasons.push(reference.reason);
    let evidenceRecord: EvidenceRecord | null = null;
    let evidenceText: string | null = null;
    if (reference.path) {
      try {
        evidenceText = await readFile(reference.path, "utf8");
        evidenceRecord = JSON.parse(evidenceText) as EvidenceRecord;
      } catch {
        reasons.push("evidence_unreadable");
      }
    }
    const reviewId = (worksheetRow["Case ID"] ?? "").trim();
    const scanId = reviewId.startsWith("eu-ir:") ? reviewId.slice("eu-ir:".length) : reviewId;
    const evidenceScanId = text(evidenceRecord?.scanId ?? evidenceRecord?.scan_id);
    if (evidenceScanId && scanId !== evidenceScanId) reasons.push("scan_id_mismatch");
    const website = (worksheetRow.Website ?? "").trim();
    const evidenceDomain = text(evidenceRecord?.domain);
    if (evidenceDomain && host(website) !== host(evidenceDomain)) reasons.push("domain_mismatch");
    const disposition = reasons.some((reason) => ["document_mismatch", "evidence_reference_outside_root", "evidence_unreadable", "scan_id_mismatch", "domain_mismatch"].includes(reason))
      ? "excluded"
      : reasons.length > 0
        ? "pending"
        : "included";
    const adjudicatedAro = adjudication.aro;
    const disagreementFields = adjudicatedAro ? FIELDS.filter((field) => proposedAro[field] !== adjudicatedAro[field]) : [];
    const access = (nested(evidenceRecord ?? {}, "coverageDiagnostics", "accessPosture") as Record<string, unknown> | null) ?? {};
    const homepageFetchStatus = text(access.homepageFetchStatus);
    const verifiedPublicSurfacesCount = typeof access.verifiedPublicSurfacesCount === "number" ? access.verifiedPublicSurfacesCount : null;
    const pagesScanned = typeof access.pagesScanned === "number" ? access.pagesScanned : null;
    const retainedVisualProof = false;
    const releaseGateReasons = [
      text(access.stopOutcomeTitle) ? "scanner_access_limited" : null,
      !verifiedPublicSurfacesCount || !pagesScanned ? "loaded_document_unverified" : null,
      !retainedVisualProof ? "retained_visual_proof_missing" : null,
    ].filter((value): value is string => value !== null);
    const labelHash = adjudicatedAro ? sha256(JSON.stringify({ reviewId, scanId, adjudicatedAro, match, notes: worksheetRow.Notes ?? "" })) : null;
    rows.push({
      reviewId,
      scanId,
      website,
      proposed: proposedAro,
      adjudicated: adjudicatedAro,
      override: text(worksheetRow.Override),
      documentMatch: match,
      notes: text(worksheetRow.Notes),
      disposition,
      releaseGateEligible: disposition === "included" && releaseGateReasons.length === 0,
      releaseGateReasons,
      dispositionReasons: [...new Set(reasons)],
      disagreements: disagreementFields,
      evidence: {
        artifactPath: reference.path ? path.relative(process.cwd(), reference.path) : null,
        sha256: evidenceText ? sha256(evidenceText) : null,
        scanId: evidenceScanId,
        domain: evidenceDomain,
        completedAt: text(nested(evidenceRecord ?? {}, "timestamps", "completedAt")),
        cmpVendor: text(access.cmpVendorName),
        accessPosture: text(access.accessPostureClass ?? access.stopOutcomeTitle),
        language: text(nested(evidenceRecord ?? {}, "summary", "language") ?? nested(evidenceRecord ?? {}, "meta", "language")),
        noGo: bool(evidenceRecord?.noGo) ?? bool(nested(evidenceRecord ?? {}, "resultDisposition", "noGo")),
        homepageFetchStatus,
        verifiedPublicSurfacesCount,
        pagesScanned,
        retainedVisualProof,
      },
      provenance: {
        labelClass: "human_adjudication_candidate",
        reviewMethod: "live_chrome_incognito_eu_ir_vpn",
        reviewerRole: "product_owner",
        reviewerAttestedLiveObservation: true,
        independentlyReviewed: false,
        evidenceOnlyReview: false,
        sourceWorksheetSha256: input.worksheetSha256,
        labelHash,
      },
    });
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const worksheetPath = path.resolve(args.worksheet);
  const evidenceRoot = path.resolve(args.evidenceRoot);
  const outDir = path.resolve(args.outDir);
  const worksheetText = await readFile(worksheetPath, "utf8");
  const rows = await buildCalibrationCorpus({ worksheetText, worksheetSha256: sha256(worksheetText), evidenceRoot });
  const exploratoryMetrics = metrics(rows);
  const releaseGateMetrics = metrics(rows, true);
  const rootCauses = rootCauseInventory(rows);
  const retrievalManifest = rawEvidenceRetrievalManifest(rows);
  const miniPacket = miniShadowPacket(rows);
  const summary = {
    totalWorksheetRows: rows.length,
    included: rows.filter((row) => row.disposition === "included").length,
    releaseGateEligible: rows.filter((row) => row.releaseGateEligible).length,
    pending: rows.filter((row) => row.disposition === "pending").length,
    excluded: rows.filter((row) => row.disposition === "excluded").length,
    rowsWithDisagreement: rootCauses.rowsWithDisagreement,
  };
  const percent = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const report = [
    "# Consent-control human review calibration",
    "",
    "## Decision",
    "",
    "The product owner attested that every worksheet website was reviewed live in Chrome Incognito through the EU-IR VPN. Complete selections are authoritative human labels for that observed live state.",
    "",
    "The linked public evidence projections do not contain retained scan-time visual proof or a verified loaded document. The live labels therefore remain separate from the production scan-time A/R/O release gate until the original retained artifacts are bound.",
    "",
    "The live review must not be used to turn retained `unknown` values into `not_observed`. It should drive raw-evidence retrieval, scanner coverage diagnosis, deterministic fixtures, and a later evidence-bound adjudication pass.",
    "",
    "## Corpus",
    "",
    `- Worksheet rows: ${summary.totalWorksheetRows}`,
    `- Complete, document-matched exploratory labels: ${summary.included}`,
    `- Pending labels: ${summary.pending}`,
    `- Excluded document/evidence mismatches: ${summary.excluded}`,
    `- Strict release-gate eligible rows: ${summary.releaseGateEligible}`,
    "",
    "## Exploratory comparison",
    "",
    `- Exact A/R/O agreement: ${percent(exploratoryMetrics.exactAroAgreement)}`,
    ...FIELDS.map((field) => {
      const fieldMetrics = exploratoryMetrics.perField[field];
      return `- ${field}: exact ${percent(fieldMetrics.exactAgreement)}, observed precision ${percent(fieldMetrics.observedPrecision)}, observed recall ${percent(fieldMetrics.observedRecall)}, false-positive claims ${percent(fieldMetrics.falsePositiveControlClaimRate)}`;
    }),
    "",
    "## Coverage leads",
    "",
    `- Scanner access-limited while live human review was attempted: ${rootCauses.coverageLeads.scannerAccessCoverageGap}`,
    `- Retained visual proof missing from linked public projection: ${rootCauses.coverageLeads.retainedVisualProofMissing}`,
    `- Loaded document unverified in linked public projection: ${rootCauses.coverageLeads.loadedDocumentUnverified}`,
    "",
    "## Required next action",
    "",
    "Resolve each disagreement to the original CanonicalEvidenceBundle, geometry artifact, screenshot, and document identity. Route access-limited rows to the no-go/incomplete lane. Only normally loaded, evidence-bound rows may enter the 95% A/R/O release gate.",
    "",
    "GPT Mini may assist in shadow mode with bounded translation or semantic conflicts after raw evidence is bound. It cannot create absence findings, convert unknown to not observed, or become the source of record.",
    "",
  ].join("\n");
  const corpusArtifact = consentControlHumanAdjudicationCorpusSchema.parse({
    artifactType: "consent_control_human_adjudication_corpus",
    artifactVersion: "1.1",
    generatedAt: new Date().toISOString(),
    sourceWorksheet: path.relative(process.cwd(), worksheetPath),
    sourceWorksheetSha256: sha256(worksheetText),
    sourceEvidenceRoot: path.relative(process.cwd(), evidenceRoot),
    provenancePolicy: "product-owner-attested live EU-IR review; authoritative for observed live state; not independent evidence-only review; scan-time release eligibility still requires retained raw evidence binding",
    humanReviewAttestation: {
      reviewerRole: "product_owner",
      coverage: "all_worksheet_websites",
      observationBasis: "live_site",
      environment: "chrome_incognito_eu_ir_vpn",
      attestedAt: new Date().toISOString(),
    },
    summary,
    rows,
  });
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "human-adjudication-corpus.json"), `${JSON.stringify(corpusArtifact, null, 2)}\n`, "utf8"),
    writeFile(path.join(outDir, "calibration-metrics.json"), `${JSON.stringify({
      artifactType: "consent_control_calibration_metrics",
      artifactVersion: "1.0",
      generatedAt: new Date().toISOString(),
      summary,
      exploratory: exploratoryMetrics,
      releaseGate: releaseGateMetrics,
    }, null, 2)}\n`, "utf8"),
    writeFile(path.join(outDir, "root-cause-inventory.json"), `${JSON.stringify({
      artifactType: "consent_control_root_cause_inventory",
      artifactVersion: "1.0",
      generatedAt: new Date().toISOString(),
      summary,
      ...rootCauses,
    }, null, 2)}\n`, "utf8"),
    writeFile(path.join(outDir, "calibration-report.md"), report, "utf8"),
    writeFile(path.join(outDir, "raw-evidence-retrieval-manifest.json"), `${JSON.stringify(retrievalManifest, null, 2)}\n`, "utf8"),
    writeFile(path.join(outDir, "mini-shadow-review-packet.json"), `${JSON.stringify(miniPacket, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify({
    outDir,
    summary,
    exploratoryGates: exploratoryMetrics.gates,
    releaseGates: releaseGateMetrics.gates,
    categories: rootCauses.categories,
    coverageLeads: rootCauses.coverageLeads,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
