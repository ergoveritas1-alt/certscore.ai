import type { PostureScores, ReportEvidencePage } from "./types.js";

import type { DetailedEvidenceReport, PublicCmpAudit, PublicCmsSecurity } from "./detailed-evidence-types.js";
export type { DetailedEvidenceCounts, DetailedEvidenceRow, DetailedEvidenceSection, DetailedEvidenceReport, PublicCmpAudit, PublicCmsSecurity, ConsentControlMeasurement } from "./detailed-evidence-types.js";

/** Reconstructed report content; canonical findings and the audit remain separate. */
export interface ReportEvidenceDocument {
  postureScores?: PostureScores;
  detailedEvidence?: DetailedEvidenceReport;
  cmpAudit?: PublicCmpAudit;
  cmsSecurity?: PublicCmsSecurity | null;
  privacyAuditEvidence?: import("./privacy-audit.js").PrivacyAuditEvidence | null;
  [key: string]: unknown;
}

const forbidden = new Set(["__proto__", "prototype", "constructor"]);
function tokens(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/") || /~(?:[^01]|$)/.test(path)) throw new Error("Invalid report evidence pointer.");
  const result = path.slice(1).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (result.some(key => forbidden.has(key))) throw new Error("Unsafe report evidence pointer.");
  return result;
}
function safeValue(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error("Unsafe report evidence object.");
    safeValue(child);
  }
}

/** Reconstruct one complete snapshot, including Unicode chunks and deduplicated evidence references. */
export function reconstructReportEvidencePages(pages: readonly ReportEvidencePage[]): ReportEvidenceDocument {
  const first = pages[0];
  if (!first) throw new Error("No report evidence pages returned.");
  let offset = 0;
  for (const [index, page] of pages.entries()) {
    if (page.scanId !== first.scanId || page.snapshot !== first.snapshot || page.section !== first.section || page.workpaper !== first.workpaper
      || page.pagination.offset !== offset || page.pagination.returned !== page.entries.length || page.pagination.total !== first.pagination.total
      || page.pagination.complete !== (index === pages.length - 1)) throw new Error("Incomplete or mismatched report evidence snapshot.");
    offset += page.entries.length;
  }
  if (offset !== first.pagination.total) throw new Error("Incomplete report evidence snapshot.");
  let root: any;
  const assigned = new Set<string>();
  const chunks = new Map<string, { parts: Map<number, string>; total: number }>();
  function read(path: string): any {
    let value = root;
    for (const key of tokens(path)) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("Unresolved report evidence reference.");
      value = value[key];
    }
    return value;
  }
  function write(path: string, value: unknown) {
    if (assigned.has(path)) throw new Error("Duplicate report evidence entry.");
    assigned.add(path);
    safeValue(value);
    const keys = tokens(path);
    if (!keys.length) { root = structuredClone(value); return; }
    const key = keys.pop()!;
    const parent = read(keys.length ? `/${keys.map(key => key.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}` : "");
    if (!parent || typeof parent !== "object" || Array.isArray(parent) && !/^(0|[1-9]\d*)$/.test(key)) throw new Error("Invalid report evidence container.");
    parent[key] = structuredClone(value);
  }
  for (const page of pages) for (const entry of page.entries) {
    tokens(entry.path);
    if (entry.stringPart !== undefined || entry.stringParts !== undefined) {
      if (typeof entry.value !== "string" || !Number.isInteger(entry.stringParts) || !Number.isInteger(entry.stringPart)
        || entry.stringParts! < 1 || entry.stringPart! < 0 || entry.stringPart! >= entry.stringParts!) throw new Error("Invalid report evidence string chunk.");
      const group = chunks.get(entry.path) ?? { parts: new Map<number, string>(), total: entry.stringParts! };
      if (group.total !== entry.stringParts || group.parts.has(entry.stringPart!)) throw new Error("Mismatched report evidence string chunks.");
      group.parts.set(entry.stringPart!, entry.value); chunks.set(entry.path, group);
    } else write(entry.path, entry.value);
  }
  for (const [path, group] of chunks) {
    if (group.parts.size !== group.total) throw new Error("Incomplete report evidence string chunks.");
    write(path, Array.from({ length: group.total }, (_, i) => group.parts.get(i)!).join(""));
  }
  const active = new Set<object>(), resolved = new Map<object, any>();
  function resolve(value: any): any {
    if (!value || typeof value !== "object") return value;
    if (active.has(value)) throw new Error("Cyclic report evidence reference.");
    if (resolved.has(value)) return resolved.get(value);
    active.add(value);
    let result = value;
    if (Object.keys(value).length === 1 && typeof value.reportContentRef === "string") result = resolve(read(value.reportContentRef));
    else for (const key of Object.keys(value)) value[key] = resolve(value[key]);
    active.delete(value); resolved.set(value, result); return result;
  }
  root = resolve(root);
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("Invalid report evidence document.");
  for (const field of ["detailedEvidence", "cmpAudit", "cmsSecurity"]) {
    if (root[field] && root[field].scanId !== first.scanId) throw new Error("Mismatched retained evidence scan identity.");
  }
  return root as ReportEvidenceDocument;
}
