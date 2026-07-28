import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type State = boolean | null;
type Aro = { accept: State; reject: State; options: State };

const root = path.resolve(process.argv[2] ?? "artifacts/public-evidence-corpus-cache");
const out = path.resolve(process.argv[3] ?? "artifacts/consent-control-assessment-adjudication-packet-eu-ir-20260727.json");
const limit = Number.parseInt(process.argv[4] ?? "100", 10);

function stateFromStatus(value: unknown): State {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized === "observed" || normalized === "available" || normalized === "yes") return true;
  if (normalized === "not observed" || normalized === "not_available" || normalized === "no") return false;
  return null;
}

function checklistState(items: unknown[], ids: string[]) {
  const row = items.find((item) => item && typeof item === "object" && ids.includes((item as Record<string, unknown>).id as string));
  return stateFromStatus(row && typeof row === "object" ? (row as Record<string, unknown>).status : null);
}

function evidenceScore(record: Record<string, unknown>) {
  const consent = record.consentSurfaceEvidence as Record<string, unknown> | undefined;
  const checklist = ((record.gdprEprivacyChecklistRows as Record<string, unknown> | undefined)?.items as unknown[] | undefined) ?? [];
  const findings = ((record.projectedFindings as Record<string, unknown> | undefined)?.items as unknown[] | undefined) ?? [];
  const retainedSize = JSON.stringify(record.retainedEvidence ?? {}).length;
  const access = ((record.coverageDiagnostics as Record<string, unknown> | undefined)?.accessPosture as Record<string, unknown> | undefined) ?? {};
  return (JSON.stringify(consent ?? {}).length > 100 ? 5 : 0)
    + (checklist.length > 0 ? 2 : 0)
    + (findings.length > 0 ? 2 : 0)
    + (retainedSize > 1000 ? 2 : 0)
    + (access.verifiedPublicSurfacesCount && Number(access.verifiedPublicSurfacesCount) > 0 ? 3 : 0)
    + (access.cmpVendorName ? 2 : 0)
    + (record.summary && typeof record.summary === "object" && (record.summary as Record<string, unknown>).score != null ? 1 : 0);
}

async function main() {
const files = (await readdir(root)).filter((name) => name.endsWith(".json"));
const latestByDomain = new Map<string, Record<string, unknown>>();
for (const name of files) {
  const artifactPath = path.join(root, name);
  try {
    const record = JSON.parse(await readFile(artifactPath, "utf8")) as Record<string, unknown>;
    const domain = typeof record.domain === "string" ? record.domain.toLowerCase() : "";
    const timestamps = (record.timestamps as Record<string, unknown> | undefined) ?? {};
    const completedAt = typeof timestamps.completedAt === "string" ? timestamps.completedAt : "";
    if (!domain || !completedAt) continue;
    const candidate = { ...record, __artifactPath: artifactPath, __completedAt: completedAt, __evidenceScore: evidenceScore(record) };
    const existing = latestByDomain.get(domain);
    if (!existing || completedAt > String(existing.__completedAt)) latestByDomain.set(domain, candidate);
  } catch {
    // Ignore non-JSON or malformed retained files; the packet fails closed per case.
  }
}

const selected = [...latestByDomain.values()]
  .sort((a, b) => Number(b.__evidenceScore) - Number(a.__evidenceScore) || String(b.__completedAt).localeCompare(String(a.__completedAt)))
  .slice(0, limit);

const rows = selected.map((record) => {
  const checklist = ((record.gdprEprivacyChecklistRows as Record<string, unknown> | undefined)?.items as unknown[] | undefined) ?? [];
  const assessment: Aro = {
    accept: checklistState(checklist, ["accept_consent_control"]),
    reject: checklistState(checklist, ["reject_all_path_availability"]),
    options: checklistState(checklist, ["options_settings_preferences_control"]),
  };
  const access = ((record.coverageDiagnostics as Record<string, unknown> | undefined)?.accessPosture as Record<string, unknown> | undefined) ?? {};
  const limitations = [
    typeof access.stopOutcomeTitle === "string" ? "access_limited" : null,
    checklist.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).assessmentStatus === "coverage_limitation") ? "coverage_limited" : null,
  ].filter((value): value is string => value !== null);
  return {
    reviewId: `eu-ir:${String(record.scanId ?? record.scan_id)}`,
    category: "eu_ir_recent_meaningful",
    reviewStatus: "pending_luna_adjudication",
    scanId: String(record.scanId ?? record.scan_id),
    url: `https://${String(record.domain)}`,
    legacy: { accept: null, reject: null, options: null },
    assessment,
    geometryStatus: "not_applicable",
    assessmentStatus: limitations.length ? "limited" : "complete",
    surfaceStatus: null,
    coverageStatus: limitations.length ? "limited" : "complete",
    changedFields: [],
    positiveRetentions: [],
    unknownFields: Object.entries(assessment).filter(([, value]) => value === null).map(([key]) => key),
    limitationCodes: limitations,
    document: { bundleUrl: null, normalizedUrl: null, finalDomUrl: null },
    bundleControls: [],
    geometryControls: [],
    artifacts: { bundle: path.relative(process.cwd(), String(record.__artifactPath)), geometry: null },
    completedAt: record.__completedAt,
    evidenceScore: record.__evidenceScore,
    source: "EU-IR public-evidence-corpus-cache",
  };
});

const packet = {
  artifactType: "consent_control_assessment_adjudication_packet",
  artifactVersion: "1.1",
  generatedAt: new Date().toISOString(),
  readOnly: true,
  reviewer: "Luna",
  sourceRoot: root,
  sourceFilter: "latest scan per domain; EU-IR evidence corpus; ranked by retained evidence richness then recency",
  summary: { totalCases: rows.length, sourceFiles: files.length, uniqueDomains: latestByDomain.size, maxRows: limit },
  adjudicationFields: ["retain_assessment", "accept_state", "reject_state", "options_state", "document_match_confirmed", "reviewer_notes"],
  rows,
};
await writeFile(out, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ out, summary: packet.summary }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
