import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, any>;

const DEFAULT_EVIDENCE_DIR = "/Volumes/miniben/CertScore/evidence";
const DEFAULT_OUT_DIR = path.join(DEFAULT_EVIDENCE_DIR, "calibration");
const GDPR_TRANSPARENCY_ROW_IDS = new Set([
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure"
]);

const nonEnglishSignals: Array<[string, RegExp]> = [
  ["fr", /\b(confidentialit[eé]|vie privee|donnees personnelles|protection des donnees)\b/i],
  ["de", /\b(datenschutz|impressum|privatsphaere|personenbezogene daten)\b/i],
  ["es", /\b(privacidad|proteccion de datos|aviso legal|datos personales)\b/i],
  ["pt", /\b(privacidade|dados pessoais|protecao de dados)\b/i],
  ["nl", /\b(privacybeleid|persoonsgegevens|cookiebeleid)\b/i],
  ["pl", /\b(prywatnosci|dane osobowe|polityka cookies)\b/i]
];

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function statusRows(json: JsonRecord): JsonRecord[] {
  return array(record(json.gdprEprivacyChecklistRows).items);
}

function statusFor(rows: JsonRecord[], id: string): string {
  return text(rows.find((row) => row.id === id)?.status).toLowerCase();
}

function guessLanguage(json: JsonRecord): { code: string; confidence: "high" | "medium" | "low" } {
  const policyText = array(record(json.policySurfaceCoverage).items)
    .map((item) => `${text(item.url)} ${text(item.title)}`).join(" ");
  const source = `${policyText} ${text(json.domain)} ${text(record(json.summary).benchmark)}`;
  for (const [code, pattern] of nonEnglishSignals) {
    if (pattern.test(source)) return { code, confidence: "medium" };
  }
  return { code: "en", confidence: "low" };
}

function consentPlatform(json: JsonRecord): string {
  const posture = record(record(json.coverageDiagnostics).accessPosture);
  const candidates = [
    posture.cmpVendorName,
    record(json.consentSurfaceEvidence).cmpVendorName,
    record(record(json.consentSurfaceEvidence).consentSummary).cmpVendorName
  ].map(text).find(Boolean);
  return candidates ?? "unknown";
}

function noGo(json: JsonRecord): boolean {
  const findingIds = array(record(record(json.retainedEvidence).findingEvidence).items).map((item) => text(item.id));
  const projectedIds = Object.values(record(json.projectedFindings)).flatMap((value) =>
    array(record(value).items).map((item) => text(item.id))
  );
  const all = [...findingIds, ...projectedIds].join(" ").toLowerCase();
  const posture = record(record(json.coverageDiagnostics).accessPosture);
  return /scan_quality_visual_no_go|normal_public_site_not_reached|access_denied|blocked|challenge/.test(all)
    || Boolean(posture.blockPageClassification || posture.accessPostureClass);
}

function accessLimited(json: JsonRecord): boolean {
  const posture = record(record(json.coverageDiagnostics).accessPosture);
  const explicitLimitedPosture = [
    posture.accessPostureClass,
    posture.blockPageClassification,
    posture.highestSuccessfulTier,
    posture.stopTier
  ].map(text).some(Boolean);
  return explicitLimitedPosture
    && posture.verifiedPublicSurfacesCount === 0
    && (posture.pagesScanned === 0 || posture.homepageFetchStatus === "skipped");
}

function buildRow(json: JsonRecord, jsonPath: string, pngPath: string | null, pngHash: string | null) {
  const rows = statusRows(json);
  const policyItems = array(record(json.policySurfaceCoverage).items);
  const consentStatuses = [
    statusFor(rows, "consent_surface_observed"),
    statusFor(rows, "accept_consent_control"),
    statusFor(rows, "reject_all_path_availability"),
    statusFor(rows, "options_settings_preferences_control")
  ];
  const transparencyStatuses = rows.filter((row) => GDPR_TRANSPARENCY_ROW_IDS.has(text(row.id)));
  const notTestableTransparency = transparencyStatuses.filter((row) => /not testable/i.test(text(row.status))).length;
  const consentObserved = consentStatuses.some((status) => status === "observed" || status === "gap observed");
  const consentSurfaceObserved = consentStatuses[0] === "observed" || consentStatuses[0] === "gap observed";
  const consentIncomplete = consentSurfaceObserved
    && consentStatuses.slice(1).some((status) => status === "not testable" || status === "");
  const transparencyNotes = transparencyStatuses.map((row) => text(row.note)).join(" ");
  const privacyPolicyFetchIncomplete = notTestableTransparency >= 3
    && /A privacy-policy surface was discovered, but (?:it was not fetched before the scan budget ended|the fetch failed)/i.test(transparencyNotes);
  const privacyPolicyNotDiscovered = notTestableTransparency >= 3
    && /No privacy-policy surface was discovered or retained/i.test(transparencyNotes);
  const nonPrivacyPolicySurfaceOnly = notTestableTransparency >= 3
    && /No privacy-policy surface was retained/i.test(transparencyNotes);
  const hasScreenshot = Boolean(pngPath);
  const isNoGo = noGo(json);
  const isAccessLimited = accessLimited(json);
  const evidenceCompleteness = isNoGo
    ? "no_go"
    : isAccessLimited
      ? "access_limited"
      : !hasScreenshot
      ? "json_only"
      : policyItems.length === 0 && !consentObserved
        ? "screenshot_limited"
        : consentIncomplete || notTestableTransparency >= 3
          ? "partial"
          : "substantial";
  const scanCompleted = text(json.scanStatus).toLowerCase() === "completed";
  const assignment = !scanCompleted
    ? "excluded"
    : isNoGo || evidenceCompleteness === "json_only"
    ? "diagnostics"
    : evidenceCompleteness === "substantial" && !consentIncomplete && notTestableTransparency < 3
      ? "benchmark"
      : "diagnostics";
  const reviewReasons: string[] = [];
  if (hasScreenshot && consentIncomplete) reviewReasons.push("screenshot_present_but_observed_consent_rows_incomplete");
  if (policyItems.length > 0 && privacyPolicyFetchIncomplete) reviewReasons.push("privacy_policy_discovered_but_gdpr_rows_not_testable");
  if (policyItems.length > 0 && privacyPolicyNotDiscovered) reviewReasons.push("privacy_policy_not_discovered");
  if (policyItems.length > 0 && nonPrivacyPolicySurfaceOnly) reviewReasons.push("non_privacy_policy_surface_only");
  if (isNoGo) reviewReasons.push("confirmed_no_go");
  else if (isAccessLimited) reviewReasons.push("access_limited_or_public_site_not_reached");
  if (!hasScreenshot) reviewReasons.push("screenshot_missing");
  if (text(json.scanStatus).toLowerCase() !== "completed") reviewReasons.push("scan_not_completed");
  const trackerRows = array(json.trackerRows?.items);
  const language = guessLanguage(json);
  return {
    scanId: text(json.scanId) || text(json.scan_id) || path.basename(jsonPath, ".json"),
    domain: text(json.domain),
    completedAt: text(record(json.timestamps).completedAt) || null,
    benchmark: text(record(json.summary).benchmark) || "unknown",
    siteType: (text(record(json.summary).benchmark).split("/")[0] ?? "unknown").trim() || "unknown",
    languageGuess: language,
    consentPlatform: consentPlatform(json),
    trackerCount: trackerRows.length,
    preConsentTrackerCount: trackerRows.filter((row) => row.preConsent === true).length,
    noGo: isNoGo,
    accessLimited: isAccessLimited,
    evidence: {
      jsonPath,
      pngPath,
      jsonSha256: sha256(Buffer.from(JSON.stringify(json))),
      pngSha256: pngHash,
      hasPolicySurface: policyItems.length > 0,
      policySurfaceCount: policyItems.length,
      consentStatuses,
      consentObserved,
      consentIncomplete,
      gdprTransparencyRows: transparencyStatuses.length,
      gdprTransparencyNotTestable: notTestableTransparency,
      privacyPolicyFetchIncomplete,
      privacyPolicyNotDiscovered,
      nonPrivacyPolicySurfaceOnly,
      completeness: evidenceCompleteness
    },
    assignment,
    reviewPriority: reviewReasons.length > 0 ? (hasScreenshot && (consentIncomplete || notTestableTransparency >= 3) ? "high" : "medium") : "none",
    reviewReasons
  };
}

async function main() {
  const evidenceDir = process.argv[2] ?? DEFAULT_EVIDENCE_DIR;
  const outDir = process.argv[3] ?? DEFAULT_OUT_DIR;
  await mkdir(outDir, { recursive: true });
  const names = await readdir(evidenceDir);
  const jsonNames = names.filter((name) => name.endsWith(".json") && /^[0-9a-f-]{36}\.json$/i.test(name));
  const rows = [];
  for (const name of jsonNames) {
    const jsonPath = path.join(evidenceDir, name);
    let json: JsonRecord;
    try {
      json = JSON.parse(await readFile(jsonPath, "utf8")) as JsonRecord;
    } catch {
      rows.push({ scanId: name.slice(0, -5), assignment: "excluded", reviewPriority: "high", reviewReasons: ["invalid_json"], evidence: { jsonPath, completeness: "invalid_json" } });
      continue;
    }
    const pngCandidate = path.join(evidenceDir, `${name.slice(0, -5)}.png`);
    let pngPath: string | null = null;
    let pngHash: string | null = null;
    try {
      const handle = await open(pngCandidate, "r");
      const header = Buffer.alloc(8);
      await handle.read(header, 0, 8, 0);
      await handle.close();
      if (header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        pngPath = pngCandidate;
        pngHash = null;
      }
    } catch {
      // Missing screenshot is a deliberate diagnostics signal.
    }
    if (json.type === "certscore_pulse_evidence") {
      rows.push(buildRow(json, jsonPath, pngPath, pngHash));
    }
  }
  rows.sort((a, b) => `${a.assignment}:${a.domain ?? ""}`.localeCompare(`${b.assignment}:${b.domain ?? ""}`));
  const reviewQueue = rows
    .filter((row) => row.reviewPriority !== "none")
    .sort((a, b) => `${a.reviewPriority}:${a.assignment}:${a.domain ?? ""}`.localeCompare(`${b.reviewPriority}:${b.assignment}:${b.domain ?? ""}`));
  const counts = rows.reduce<Record<string, number>>((out, row) => {
    out[row.assignment] = (out[row.assignment] ?? 0) + 1;
    return out;
  }, {});
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    source: { evidenceDir, jsonCount: jsonNames.length },
    purpose: "Evidence quality inventory and calibration cohort triage. This artifact does not assign finding truth or alter production findings.",
    summary: { total: rows.length, assignments: counts, reviewQueue: reviewQueue.length },
    rows
  }, null, 2)}\n`);
  await writeFile(path.join(outDir, "review-queue.json"), `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), rows: reviewQueue }, null, 2)}\n`);
  console.log(JSON.stringify({ total: rows.length, assignments: counts, reviewQueue: reviewQueue.length, outDir }, null, 2));
}

void main();
