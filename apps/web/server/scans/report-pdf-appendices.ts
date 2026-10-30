import { pdfNarrativeFindings } from "./report-pdf-evidence";
import type { CanonicalReportExport } from "./report-export";
import type { PdfLine } from "./report-export-pdf";
import { PDF_REPORT_TOPICS, pdfTopicForFinding, pdfTopicForRow, type PdfReportTopic } from "./report-pdf-topics";
import { wrapPdfText } from "./report-pdf-fonts";
import { evidenceSectionCounts, cmsEvidenceVersionLabel } from "../../lib/scans/detailed-evidence-presentation";
import { TECHNOLOGY_NAMES, TECHNOLOGY_CATEGORY_LABELS, TECHNOLOGY_SCOPE_LABELS } from "@certscore/contracts";
import { projectConsentControlReport } from "../../lib/scans/consent-control-report";
import { pdfChoiceWindows, pdfInventoryRows, pdfTimingEvents, pdfRejectTimingEvents } from "./report-pdf-reader";
import { reportSectionInFocus } from "../../lib/scans/report-framework-scope";
import { reportStatusLabel } from "../../lib/scans/report-status-presentation";

type Layout = { text(value: unknown, size?: number): PdfLine[]; heading(text: string): PdfLine };
const value = (input: unknown): string => input === null || input === undefined || input === "" ? "Not retained"
  : typeof input === "boolean" ? input ? "Yes" : "No" : Array.isArray(input) ? input.map(value).join(", ") : String(input);
const label = (input: string) => input
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/_/g, " ")
  .toLowerCase()
  .replace(/\b(url|urls|tls|ssl|http|https|cmp|gpc|gdpr|wcag|id)\b/g, token => token.toUpperCase())
  .replace(/^./, character => character.toUpperCase());
const setting = (checked: boolean | null) => checked === null ? "Not captured" : checked ? "On" : "Off";

/** Rows wrap and continue across pages; no retained cell is clipped to a character limit. */
export function pdfEvidenceTable(id: string, headers: string[], rows: string[][], widths?: number[]): PdfLine[] {
  rows=rows.map(row=>row.map(reportStatusLabel));
  if (!rows.length) return [];
  const columnWidths = widths ?? headers.map(() => 512 / headers.length);
  const headerCells = headers.map((header, index) => wrapPdfText(header, columnWidths[index]! - 16, 8, true));
  const result: PdfLine[] = [{ text: headers.join(" | "), kind: "tableHeader", tableId: id,
    cells: headerCells, columnWidths, reservedHeight: Math.max(...headerCells.map(cell => cell.length)) * 11 + 8, gapBefore: 8 }];
  for (const row of rows) {
    const wrapped = row.map((cell, index) => wrapPdfText(cell, columnWidths[index]! - 16, 8));
    const count = Math.max(...wrapped.map(cell => cell.length));
    for (let start = 0; start < count; start += 40) {
      const cells = wrapped.map(cell => cell.slice(start, start + 40));
      const height = Math.max(1, ...cells.map(cell => cell.length)) * 11 + 8;
      result.push({ text: row.join(" | "), kind: "tableRow", tableId: id, cells, columnWidths, reservedHeight: height });
    }
  }
  if (result[1]) result[0]!.keepWithNextHeight = result[1].reservedHeight;
  return result;
}
function chart(title: string, bars: Array<{ label: string; value: number }>): PdfLine[] {
  const lines: PdfLine[] = [];
  for (let start = 0; start < bars.length; start += 20) {
    const batch = bars.slice(start, start + 20);
    const caption = start ? `${title} (continued)` : title;
    lines.push({ text: caption, kind: "evidenceChart", chart: { title: caption, bars: batch }, reservedHeight: 36 + batch.length * 19, gapBefore: 14 });
  }
  return lines;
}
function distribution(rows: string[]) {
  return [...new Set(rows)].map(name => ({ label: name, value: rows.filter(item => item === name).length }));
}

export function pdfPolicyEvidenceLines(report: CanonicalReportExport, layout: Layout): PdfLine[] {
  if(!reportSectionInFocus("gdpr-transparency",report.reviewFocus))return [];
  const appendix = report.appendix.gdprTransparency;
  const details = (report.appendix.evidenceDossier?.checklistDetails ?? []).filter(item => item.topic === "policy");
  const isSource = (key: string) => /(?:^|\/ )(?:sourceUrl|policyUrl|selectedPolicySectionUrl|surfaceUrl)$/i.test(key);
  const sources = [...new Set([...details.flatMap(item => item.facts.filter(fact => isSource(fact.label)).map(fact => fact.value)),
    ...(report.privacyAuditEvidence?.notices.map(notice => notice.url) ?? [])])].filter(source => /^https?:\/\//i.test(source));
  const excerpt = (text: string) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= 180) return normalized;
    const candidate = normalized.slice(0, 180);
    const boundary = candidate.lastIndexOf(" ");
    return `${candidate.slice(0, boundary > 90 ? boundary : 180)}...`;
  };
  const lines: PdfLine[] = [...layout.text(appendix.scopeNote, 9),
    ...layout.text("Condensed disclosure evidence. Excerpts below are shortened for this PDF; full passages, detailed checks and provenance remain in the JSON workpaper.", 9)];
  if (sources.length) lines.push(layout.heading("Policy sources"));
  sources.forEach((source, index) => {
    const detail = details.find(item => item.facts.some(fact => isSource(fact.label) && fact.value === source));
    const metadata = ["documentOwnerEntity", "retrievalTimestamp", "detectedLanguage", "lastUpdatedText"].flatMap(key => {
      const fact = detail?.facts.find(item => item.label.endsWith(`/ ${key}`));
      return fact ? [`${label(key)}: ${fact.value}`] : [];
    });
    lines.push(...layout.text(`S${index + 1}: ${source}`, 8).map(line => ({ ...line, href: source })),
      ...layout.text(metadata.join(" | "), 8));
  });
  lines.push(layout.heading("Transparency checks"), ...pdfEvidenceTable("policy-disclosures", ["Disclosure", "Status", "Condensed retained evidence"], appendix.rows.map(row => {
    const detail = details.find(item => item.id === row.id);
    const source = detail?.facts.find(fact => isSource(fact.label))?.value;
    const sourceIndex = source ? sources.indexOf(source) : -1;
    const passage = detail?.facts.find(fact => /(?:^|\/ )selectedPolicySectionExcerpt$/i.test(fact.label))?.value
      ?? detail?.facts.find(fact => /(?:^|\/ )evidence_?text$/i.test(fact.label))?.value;
    const context = sourceIndex >= 0 ? `S${sourceIndex + 1}. ` : "";
    const evidence = ["Not confirmed", "Not testable", "Insufficient evidence"].includes(row.status)
      ? "No confirmed disclosure retained; this does not establish absence."
      : passage && source ? `Excerpt: ${excerpt(passage)}` : excerpt(row.rationale);
    return [row.label, row.status, `${context}${evidence}`];
  }), [145, 77, 290]).map(line => line.kind === "tableRow" && ["Not confirmed", "Not testable", "Insufficient evidence"].includes(line.cells?.[1]?.join(" ") ?? "")
    ? { ...line, flowGroup: "policy-coverage-limitations" } : line));
  if (!appendix.rows.length) lines.push(...layout.text("No persisted transparency checklist rows were retained.", 9));
  const additional = (report.gdprEprivacyReview?.rows ?? details).filter(item => pdfTopicForRow(item.id) === "policy" && !appendix.rows.some(row => row.id === item.id));
  if (additional.length) lines.push(...layout.text(`Other policy checks: ${additional.map(item => `${item.label}: ${item.status}`).join("; ")}.`, 8));
  lines.push(...layout.text("Policy-related issues and remediation appear in Top issues and remediation. Detailed technical evidence is retained in the JSON workpaper.", 9)
    .map(line => ({ ...line, internalDestination: "findings" })));
  return lines;
}

/** Detailed presentation consumes only existing report projections and typed retained packets. */
export function appendixEvidenceLines(report: CanonicalReportExport, layout: Layout) {
  const sections: Record<PdfReportTopic, PdfLine[]> = { consent: [], storage: [], policy: [], forms: [], security: [], external: [], tls: [], accessibility: [] };
  const dossier = report.appendix.evidenceDossier;
  const runtime = report.appendix.cookieAndTrackerInventory;
  const findings = pdfNarrativeFindings(report);
  const controls = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  const cmp = dossier?.cmp;
  const collection = report.appendix.dataCollectionSurfaces;
  const cms = dossier?.cmsSecurity;
  const { storage: storageRows, external: externalRows } = pdfInventoryRows(report);
  const domainCount = (rows: typeof runtime.rows) => new Set(rows.flatMap(row => row.domains)).size;
  const policyFacts = (dossier?.checklistDetails ?? []).filter(row => row.topic === "policy").flatMap(row => row.facts);
  const policySources = new Set([...(report.privacyAuditEvidence?.notices.map(notice => notice.url) ?? []), ...policyFacts.filter(fact => /(?:sourceUrl|policyUrl|selectedPolicySectionUrl|surfaceUrl)$/i.test(fact.label)).map(fact => fact.value)]);
  const policyPassages = new Set([...(report.privacyAuditEvidence?.notices.flatMap(notice => notice.passages.map(passage => passage.excerpt)) ?? []), ...policyFacts.filter(fact => /excerpt|evidence_?text/i.test(fact.label)).map(fact => fact.value)]);
  const stats: Record<PdfReportTopic, Array<{ label: string; value: string }>> = {
    consent: [{ label: "CMP checks", value: cmp ? String(cmp.audit.rows.length) : "Unavailable" }, { label: "First-layer choices observed", value: controls ? `${Object.values(controls.controls).filter(state => state === "observed").length} / 3` : "Unavailable" }, { label: "CMP provider", value: cmp?.audit.experience?.provider ?? cmp?.provider ?? "Not retained" }],
    storage: [{ label: "Cookie rows", value: String(runtime.summary.cookieRows) }, { label: "Local / session storage rows", value: String(runtime.summary.storageRows ?? 0) }, { label: "Retained domains", value: String(domainCount(storageRows)) }],
    policy: report.reviewFocus==="ccpa_cpra"?[{label:"California review areas",value:String(report.californiaScore?.reviewCoverage?.families.length??"Not retained") }]:[{ label: "Disclosure checks", value: String(report.appendix.gdprTransparency.rows.length) }, { label: "Retained policy source URLs", value: String(policySources.size) }, { label: "Retained policy passages", value: String(policyPassages.size) }],
    forms: [{ label: "Retained forms", value: String(collection.summary.totalForms) }, { label: "Retained fields", value: String(collection.summary.totalFields) }, { label: "Destination request records", value: dossier?.formDestinations ? String(dossier.formDestinations.trace.requests.length) : "Not retained" }],
    security: [{ label: "CMS platforms", value: cms ? String(cms.assessment.detections.length) : "Not retained" }, { label: "Plugins", value: cms?.pluginInventory ? String(cms.pluginInventory.detections.length) : "Not retained" }, { label: "Transport security checks", value: String((report.gdprEprivacyReview?.rows ?? []).filter(row => ["security", "tls"].includes(pdfTopicForRow(row.id) ?? "")).length) }],
    external: [{ label: "Service rows shown", value: String(externalRows.length) }, { label: "Retained domains", value: String(domainCount(externalRows)) }, { label: "Request evidence rows", value: String(runtime.summary.requestEvidenceRows) }],
    tls: [{ label: "TLS checklist rows", value: String((report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === "tls").length) }, { label: "Projected findings", value: String(findings.filter(finding => pdfTopicForFinding(finding) === "tls").length) }, { label: "Evidence scope", value: "Starting page" }],
    accessibility: [{ label: "Failed automated rules", value: value(report.accessibilityAudit?.failedRuleCount) }, { label: "Affected nodes", value: value(report.accessibilityAudit?.affectedNodeCount) }, { label: "Manual checks", value: value(report.accessibilityAudit?.reviewRuleCount) }],
  };
  for (const topic of PDF_REPORT_TOPICS) {
    const rows = topic.id === "consent" && cmp ? cmp.audit.rows : topic.id === "policy" ? report.appendix.gdprTransparency.rows
      : (report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === topic.id || topic.id === "security" && pdfTopicForRow(row.id) === "tls");
    const counts = evidenceSectionCounts(rows);
    sections[topic.id].push({ text: "Evidence overview", kind: "topicOverview", reservedHeight: counts.checks ? 90 : 65, gapBefore: 8,
      overview: { metrics: stats[topic.id], observed: counts.observed, review: counts.review, limited: counts.limited, checks: counts.checks } });
  }

  const a = sections.consent;
  if (cmp) {
    if (cmp.audit.experience?.summary) a.push(...layout.text(cmp.audit.experience.summary));
    a.push(layout.heading("CMP identity and consent choices"), ...layout.text(`Provider: ${cmp.audit.experience?.provider ?? cmp.provider ?? "Not retained"}. Consent experience: ${cmp.audit.experience?.title ?? "Consent choices"}.${cmp.audit.inspectionSupport ? ` Preference inspection: ${label(cmp.audit.inspectionSupport.state)}.` : ""}`, 9));
    a.push(layout.heading("CMP audit matrix"), ...pdfEvidenceTable("cmp-matrix", ["Criterion", "Result"], cmp.audit.rows.map(row => [row.label, row.status]), [350, 162]));
    for (const row of cmp.audit.rows) {
      const support = row.supportingEvidence;
      if (!support) continue;
      const inventory = support.inventory;
      if (inventory && Object.keys(inventory).length > 0 && Object.keys(inventory).every(key => ["consentStorage", "choiceActivity", "expiries"].includes(key)) && !support.prominence && !support.cookieComparison && !support.requests?.length) continue;
      a.push(layout.heading(row.label), ...layout.text(`Result: ${reportStatusLabel(row.status)}. ${row.detail ?? ""}`));
      if (support?.prominence) {
        const geometry = support.prominence;
        a.push(...pdfEvidenceTable(`cmp-geometry-${row.id}`, ["Control", "Bounds: x, y, width, height", "Fill contrast / outer emphasis"], [
            ["Accept", geometry.accept.bounds.join(", "), `${geometry.accept.fillContrast}; ${geometry.accept.outerEmphasisFraction}`],
            ["Reject", geometry.reject.bounds.join(", "), `${geometry.reject.fillContrast}; ${geometry.reject.outerEmphasisFraction}`],
          ], [90, 242, 180]), ...layout.text(`Capture skew: ${geometry.captureSkewMs} ms.`, 8));
      }
      if (inventory?.categories?.length) a.push(...chart("Captured category settings", distribution(inventory.categories.map(item => setting(item.checked)))),
        ...pdfEvidenceTable(`cmp-categories-${row.id}`, ["Category", "Captured setting"], inventory.categories.map(item => [item.name, setting(item.checked)])));
      if (inventory?.privacyChoices?.length) a.push(...pdfEvidenceTable(`cmp-choices-${row.id}`, ["Privacy choice", "Availability", "Captured setting"], inventory.privacyChoices.map(item => [item.label, item.enabled ? "Enabled" : "Inactive", setting(item.checked)]), [256, 128, 128]));
      if (inventory?.services?.length) a.push(...pdfEvidenceTable(`cmp-services-${row.id}`, ["CMP service", "Identification source", "Evidence reference"], inventory.services.map(item => [item.name, label(item.source), value(item.sourceRef)]), [192, 160, 160]));
      for (const disclosure of inventory?.serviceDisclosures ?? []) a.push(...layout.text(`Named-service disclosure: ${disclosure.excerpt}`, 9));
      if (inventory?.declarations?.length) a.push(...pdfEvidenceTable(`cmp-declarations-${row.id}`, ["Cookie / pattern", "CMP-stated purpose", "CMP-stated retention / observed expiry"], inventory.declarations.map(item => [item.name,
        `${item.purpose || "Not captured"}${item.inferredPurpose ? ` | Inferred separately: ${item.inferredPurpose.category}; ${item.inferredPurpose.basis}` : ""}`,
        `${item.duration || "Not captured"}${item.observedExpiry ? ` | Observed ${item.observedExpiry.visit}: ${new Date(item.observedExpiry.expiresAtEpochSeconds * 1000).toISOString()}; ${Math.round(item.observedExpiry.remainingSeconds / 86400 * 10) / 10} days remaining` : ""}`]), [128, 192, 192]));
      if (inventory?.cookies?.length) a.push(...pdfEvidenceTable(`cmp-cookie-matches-${row.id}`, ["Observed cookie", "CMP comparison", "Capture"], inventory.cookies.map(item => [item.name,
        item.matchedPattern ? `Matched: ${item.matchedPattern}` : item.possibleTemplateMatch ? `Possible template only: ${item.possibleTemplateMatch.pattern}` : "No matched declaration retained",
        `${item.observedIn.map(label).join(", ")}${item.observedExpiry ? `; expires ${new Date(item.observedExpiry.expiresAtEpochSeconds * 1000).toISOString()}` : ""}`]), [160, 192, 160]));
      if (support?.requests?.length) a.push(...pdfEvidenceTable(`cmp-requests-${row.id}`, ["Vendor / purpose", "Request", "After Reject"], support.requests.map(item => [`${item.vendor}; ${item.category}`, `${item.hostname}${item.path}`, `+${item.msAfterReject} ms`]), [145, 257, 110]));
      if (support?.cookieComparison) {
        const c = support.cookieComparison;
        a.push(...pdfEvidenceTable(`cmp-comparison-${row.id}`, ["Comparison fact", "Retained value"], [["Declared patterns", String(c.declarationPatternCount)], ["Observed cookie names", String(c.observedCookieNameCount)], ["Unmatched names", `${c.unmatchedNameCount}: ${c.unmatchedNames.join(", ")}`], ["Possible template names (unverified)", value(c.possibleTemplateNameCount)], ["Omitted After Accept cookies", value(c.omittedAfterAcceptCookieCount)], ["Declaration inventory complete", value(c.declarationInventoryComplete)], ["All unmatched names only after Accept", value(c.allUnmatchedOnlyAfterAccept)]]));
      }
    }
  }
  const assessment = report.consentControlAssessment;
  if (assessment && controls) {
    a.push(layout.heading("First-layer control evidence"), ...pdfEvidenceTable("control-evidence", ["Intent / label", "Layer / visibility / actionable", "Timing"], assessment.evidence.filter((item, index, all) => all.findIndex(candidate => candidate.intent === item.intent && candidate.label === item.label) === index).map(item => [
      `${label(item.intent)}: ${value(item.label)}`, `${label(item.layer)}; visible ${value(item.visible)}; actionable ${value(item.actionable)}; ${label(item.presentationType)}; ${label(item.placementType)}; locale ${value(item.locale)}`,
      `${item.observedAtMs} ms after page start`,
    ]), [180, 242, 90]));
  }

  a.push(...pdfChoicePathEvidence(report, layout));

  sections.storage.push(...chart("Cookie and storage purposes", distribution(runtime.rows.filter(row => row.type === "cookie" || row.type === "storage").flatMap(row => row.purpose).map(purpose => /^unknown(?: purpose)?(?: -.*)?$/i.test(purpose) ? "Unknown purpose" : purpose))));
  sections.external.push(...chart("Service / tracker purposes", distribution(runtime.rows.filter(row => row.type !== "cookie" && row.type !== "storage").flatMap(row => row.purpose))));
  sections.forms.push(...chart("Field categories", distribution(collection.forms.flatMap(form => form.fields.map(field => label(field.semanticCategory))))));
  const trace = dossier?.formDestinations;
  if (trace) {
    const d = sections.forms;
    d.push(layout.heading("Form events and destinations"));
    for (const event of trace.trace.events) d.push(...pdfEvidenceTable(`form-event-${event.evidenceRef}`, ["Event", "Declared destination", "Fields"], [[`${event.kind} at ${event.observedAtMs} ms; form ${event.formIndex + 1}`, event.actionUrl, event.fields.map(field => `${field.name}: ${field.category}; personal ${value(field.personal)}`).join("; ")]], [130, 180, 202]));
    d.push(...pdfEvidenceTable("form-destination-requests", ["Request / recipient", "Relationship", "Timing"], trace.trace.requests.map(request => [
      `${request.method} ${request.url}; ${request.party}`, `${label(request.status)}; ${request.relation === "exact_field_value_match" ? "Exact field-value match" : "Timing association only"}; outside declared destination: ${value(request.outsideDeclaredDestination)}`,
      `${request.observedAtMs} ms`,
    ]), [190, 160, 162]));
  }
  if (cms) {
    const e = sections.security;
    e.push(layout.heading("Tech stack observed"), ...pdfEvidenceTable("cms-detections", ["Platform", "Retained version", "Identification evidence"], cms.assessment.detections.map(item => [item.name, cmsEvidenceVersionLabel(item), `${item.evidenceRefs.join(", ")}; ${item.versionBasis}; ${item.versionStatus}; confidence ${item.confidence}; observed versions ${item.observedVersions.join(", ")}; runtime version confirmed ${value(item.runtimeVersionConfirmed)}`]), [145, 155, 212]));
    e.push(...pdfEvidenceTable("cms-plugins", ["Plugin", "Version / state", "Evidence references"], (cms.pluginInventory?.detections ?? []).map(item => [item.name, `${item.version ?? "Not detected"}; ${item.versionStatus}; observed versions ${item.observedVersions.join(", ")}`, item.evidenceRefs.join(", ")]), [180, 140, 192]));
    for (const match of cms.assessment.matches) e.push(...layout.text(`${match.record.id}: ${match.record.title}. ${match.record.qualification ?? ""}`, 9),
      ...layout.text(`Vendor fixes: ${match.record.fixedVersions?.join(", ") || "Not retained"}. Source: ${match.record.sourceUrl}. Evidence ${match.evidenceRef}; detection ${match.detectionRef}; confidence ${match.confidence}; matched range ${match.matchedRange}.`, 8));
    e.push(...pdfEvidenceTable("cms-signals", ["Identification source", "Value", "Source URL"], cms.signals.map(item => [label(item.kind), item.value, item.sourceUrl]), [120, 210, 182]));
    if (cms.technologyInventory) {
      e.push(...pdfEvidenceTable("technology-inventory", ["Technology / category", "Version / confidence", "Scope / evidence"], cms.technologyInventory.detections.map(item => [
        `${TECHNOLOGY_NAMES[item.id]}; ${TECHNOLOGY_CATEGORY_LABELS[item.category]}`,
        `${item.version ?? label(item.versionStatus)}; ${item.confidence}; ${item.observedVersions.join(", ")}`,
        `${TECHNOLOGY_SCOPE_LABELS[item.scope]}; ${item.evidenceRefs.join(", ")}; ${item.ruleIds.join(", ")}`,
      ]), [160, 140, 212]));
      e.push(...pdfEvidenceTable("technology-signals", ["Source / reference", "Observed value", "Source URL"], cms.technologyInventory.signals.map(item => [
        `${item.evidenceRef}; ${item.sourceRef}; ${item.kind}`, item.value, item.sourceUrl,
      ]), [150, 180, 182]));
    }
  }
  if (report.accessibilityEvidence) sections.accessibility.push(...chart("Affected nodes by automated rule", report.accessibilityEvidence.violations.map(rule => ({ label: rule.ruleId, value: rule.nodeCount }))));
  sections.policy.push(...pdfPolicyEvidenceLines(report, layout));

  for (const item of dossier?.checklistDetails ?? []) {
    if (item.topic === "policy") continue;
    const destination = sections[item.topic ?? "policy"];
    if (!item.facts.length && !item.subchecks.length) continue;
    destination.push(layout.heading(`Evidence: ${item.label}`), ...layout.text(`${reportStatusLabel(item.status)}. ${item.explanation}`, 9));
    const publicFacts = item.facts.filter(fact => !/hash|artifact|contractVersion|evidenceRef|discoveryMethod/i.test(fact.label));
    if (publicFacts.length) destination.push(...pdfEvidenceTable(`checklist-facts-${item.id}`, ["Evidence", "Detail"], publicFacts.map(fact => [label(fact.label), fact.value]), [165, 347]));
    if (item.subchecks.length) destination.push(...pdfEvidenceTable(`checklist-subchecks-${item.id}`, ["Check", "Status", "Evidence / note"], item.subchecks.map(check => [check.label, check.status, `${check.note}; ${check.evidenceRefs.join(", ")}`]), [180, 110, 222]));
  }
  return sections;
}

export function pdfChoicePathEvidence(report: CanonicalReportExport, layout: Layout): PdfLine[] {
  const windows = pdfChoiceWindows(report);
  const cmpRows = report.appendix.evidenceDossier?.cmp?.audit.rows ?? [];
  if (!windows.length && !report.postAcceptObservation && !report.postRefusalObservation) return [];
  const lines: PdfLine[] = [{ ...layout.heading("Accept / Reject results"), keepWithNextHeight: 100 }];
  const records = cmpRows.flatMap(row => row.supportingEvidence?.inventory?.consentStorage ?? []);
  const executions = { accept: report.postAcceptObservation?.execution, reject: report.postRefusalObservation && "execution" in report.postRefusalObservation ? report.postRefusalObservation.execution : undefined };
  lines.push(...layout.text("Each choice was tested in a fresh, independent session. Window lengths apply to the whole session, not separately to each vendor.", 9),
    ...pdfEvidenceTable("choice-path-summary", ["Choice", "Execution", "Measured window", "Network events", "Consent record change"],
      (["accept", "reject"] as const).map(action => {
        const window = windows.find(item => item.action === action);
        const execution = executions[action];
        return [label(action), execution ? `${execution.clickCompleted ? "Click completed" : "Click incomplete"}; ${execution.consentConfirmed ? "decision confirmed" : "decision unconfirmed"}` : "Not captured",
          window ? `${window.windowMs / 1000} s` : "Not captured",
          window ? `${window.requestCount} total; ${window.nonEssentialRequestCount} non-essential; ${window.requests.length} detailed records` : "Not captured",
          records.filter(record => record.visit.toLowerCase() === action).map(record => `${record.name}: ${record.change}`).join("; ") || "Not captured"];
      }), [48, 115, 70, 139, 140]));
  lines.push(...layout.text("Zero requests means none were observed in that bounded session; it is not a vendor-by-vendor pass or proof of future behavior. Different window lengths are not directly comparable rates. Instrumented request/write events and consent-cookie snapshots are separate measurements.", 9));
  const requests = windows.flatMap(window => window.requests.map(request => [label(window.action), `${request.vendor}; ${label(request.purpose)}`,
    `${request.hostname}${request.path}`, `+${request.msAfterClick} ms after click; ${request.nonEssential ? "Non-essential" : "Other activity"}`]));
  if (requests.length) lines.push(...pdfEvidenceTable("choice-path-requests", ["Choice", "Service / purpose", "Observed request", "Timing / classification"], requests, [48, 125, 205, 134]));
  if (windows.some(window => window.requests.length < window.requestCount)) lines.push(...layout.text("Detailed request rows are a bounded sample; the summary totals include additional observed events.", 9));
  for (const [name, observation] of [["Accept", report.postAcceptObservation], ["Reject", report.postRefusalObservation]] as const) {
    if (observation?.interpretation) lines.push(...layout.text(`${name}: ${observation.interpretation}`, 9));
  }
  const timing = report.appendix.evidenceDossier?.rejectTiming;
  if (timing) lines.push(...layout.text(`Reject evidence: ${timing.networkRequestCount} eligible network requests and ${timing.storageWriteCount} storage writes. ${timing.inFlightExclusionVerified ? "In-flight request chains were excluded." : "In-flight exclusion proof is not available in this summary."}${timing.registrationTimeIsUpperBound ? " Confirmation time is the observed upper bound." : ""}`, 9));
  if (timing?.inFlightExclusionVerified) for (const request of timing.networkRequests ?? []) lines.push(...layout.text(`${request.vendor ?? "Service"}: ${request.url} started ${request.millisecondsAfterConfirmation} ms after the observed refusal confirmation.`, 9));
  const pageEvents = pdfTimingEvents(report);
  const rejectEvents = pdfRejectTimingEvents(report);
  if (pageEvents.length || rejectEvents.length) lines.push(...pdfEvidenceTable("choice-path-timing", ["Visit", "Time origin", "Observed event sequence"], [
    ...(pageEvents.length ? [["Initial page", "Page start", pageEvents.map(event => `${(event.milliseconds / 1000).toFixed(2)} s: ${event.label}`).join(" -> ")]] : []),
    ...(rejectEvents.length ? [["Reject session", "Refusal confirmation", rejectEvents.map(event => `+${event.milliseconds} ms: ${event.label}`).join(" -> ")]] : []),
  ], [80, 110, 322]));
  const expiryRows = cmpRows.filter(row => row.supportingEvidence?.inventory?.expiries?.length);
  for (const row of expiryRows) {
    lines.push(layout.heading("Consent-cookie expiry by visit"), ...layout.text(row.detail ?? "Observed expiry does not establish how long the choice remains effective.", 9),
      ...pdfEvidenceTable(`choice-expiry-${row.id}`, ["Visit / cookie", "Domain / path", "Captured / expires / remaining"], row.supportingEvidence!.inventory!.expiries!.map(item => [`${item.visit}: ${item.name}`, `${value(item.domain)} ${value(item.path)}`,
        `${new Date(item.capturedAtEpochSeconds * 1000).toISOString()} / ${new Date(item.expiresAtEpochSeconds * 1000).toISOString()} / ${(item.remainingSeconds / 86400).toFixed(2)} days`]), [150, 150, 212]));
  }
  return lines.map(line => ({ ...line, flowGroup: "consent-choice-results" }));
}
