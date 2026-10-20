import type { CanonicalReportExport } from "./report-export";
import type { PdfLine } from "./report-export-pdf";
import { PDF_REPORT_TOPICS, pdfTopicForFinding, pdfTopicForRow, type PdfReportTopic } from "./report-pdf-topics";
import { wrapPdfText } from "./report-pdf-fonts";
import { evidenceSectionCounts, cmsEvidenceVersionLabel } from "../../lib/scans/detailed-evidence-presentation";
import { projectConsentControlReport } from "../../lib/scans/consent-control-report";

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
  if (!rows.length) return [];
  const columnWidths = widths ?? headers.map(() => 512 / headers.length);
  const headerCells = headers.map((header, index) => wrapPdfText(header, columnWidths[index]! - 16, 8, true));
  const result: PdfLine[] = [{ text: headers.join(" | "), kind: "tableHeader", tableId: id,
    cells: headerCells, columnWidths, reservedHeight: Math.max(...headerCells.map(cell => cell.length)) * 11 + 12, gapBefore: 8 }];
  for (const row of rows) {
    const wrapped = row.map((cell, index) => wrapPdfText(cell, columnWidths[index]! - 16, 8));
    const count = Math.max(...wrapped.map(cell => cell.length));
    for (let start = 0; start < count; start += 40) {
      const cells = wrapped.map(cell => cell.slice(start, start + 40));
      const height = Math.max(1, ...cells.map(cell => cell.length)) * 11 + 12;
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

/** Detailed presentation consumes only existing report projections and typed retained packets. */
export function appendixEvidenceLines(report: CanonicalReportExport, layout: Layout) {
  const sections: Record<PdfReportTopic, PdfLine[]> = { consent: [], storage: [], policy: [], forms: [], security: [], external: [], tls: [], accessibility: [] };
  const dossier = report.appendix.evidenceDossier;
  const runtime = report.appendix.cookieAndTrackerInventory;
  const findings = report.projection.unifiedFindings as Array<Record<string, unknown>>;
  const controls = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  const cmp = dossier?.cmp;
  const collection = report.appendix.dataCollectionSurfaces;
  const cms = dossier?.cmsSecurity;
  const storageRows = runtime.rows.filter(row => row.type === "cookie" || row.type === "storage");
  const externalRows = runtime.rows.filter(row => row.type !== "cookie" && row.type !== "storage");
  const domainCount = (rows: typeof runtime.rows) => new Set(rows.flatMap(row => row.domains)).size;
  const policyFacts = (dossier?.checklistDetails ?? []).filter(row => row.topic === "policy").flatMap(row => row.facts);
  const policySources = new Set([...(report.privacyAuditEvidence?.notices.map(notice => notice.url) ?? []), ...policyFacts.filter(fact => /(?:sourceUrl|policyUrl|selectedPolicySectionUrl|surfaceUrl)$/i.test(fact.label)).map(fact => fact.value)]);
  const policyPassages = new Set([...(report.privacyAuditEvidence?.notices.flatMap(notice => notice.passages.map(passage => passage.excerpt)) ?? []), ...policyFacts.filter(fact => /excerpt|evidence_?text/i.test(fact.label)).map(fact => fact.value)]);
  const stats: Record<PdfReportTopic, Array<{ label: string; value: string }>> = {
    consent: [{ label: "CMP checks", value: cmp ? String(cmp.audit.rows.length) : "Unavailable" }, { label: "First-layer choices observed", value: controls ? `${Object.values(controls.controls).filter(state => state === "observed").length} / 3` : "Unavailable" }, { label: "CMP provider", value: cmp?.audit.experience?.provider ?? cmp?.provider ?? "Not retained" }],
    storage: [{ label: "Cookie rows", value: String(runtime.summary.cookieRows) }, { label: "Local / session storage rows", value: String(runtime.summary.storageRows ?? 0) }, { label: "Retained domains", value: String(domainCount(storageRows)) }],
    policy: [{ label: "Disclosure checks", value: String(report.appendix.gdprTransparency.rows.length) }, { label: "Retained policy source URLs", value: String(policySources.size) }, { label: "Retained policy passages", value: String(policyPassages.size) }],
    forms: [{ label: "Retained forms", value: String(collection.summary.totalForms) }, { label: "Retained fields", value: String(collection.summary.totalFields) }, { label: "Destination request records", value: dossier?.formDestinations ? String(dossier.formDestinations.trace.requests.length) : "Not retained" }],
    security: [{ label: "CMS platforms", value: cms ? String(cms.assessment.detections.length) : "Not retained" }, { label: "Plugins", value: cms?.pluginInventory ? String(cms.pluginInventory.detections.length) : "Not retained" }, { label: "Connection checks", value: String((report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === "security").length) }],
    external: [{ label: "Service / embed rows", value: String(runtime.rows.filter(row => row.type !== "cookie" && row.type !== "storage").length) }, { label: "Retained domains", value: String(domainCount(externalRows)) }, { label: "Request evidence rows", value: String(runtime.summary.requestEvidenceRows) }],
    tls: [{ label: "TLS checklist rows", value: String((report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === "tls").length) }, { label: "Projected findings", value: String(findings.filter(finding => pdfTopicForFinding(finding) === "tls").length) }, { label: "Evidence scope", value: "Starting page" }],
    accessibility: [{ label: "Failed automated rules", value: value(report.accessibilityAudit?.failedRuleCount) }, { label: "Affected nodes", value: value(report.accessibilityAudit?.affectedNodeCount) }, { label: "Rules needing manual review", value: value(report.accessibilityAudit?.reviewRuleCount) }],
  };
  for (const topic of PDF_REPORT_TOPICS) {
    const rows = topic.id === "consent" && cmp ? cmp.audit.rows : (report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === topic.id);
    const counts = evidenceSectionCounts(rows);
    sections[topic.id].push({ text: "Evidence overview", kind: "topicOverview", reservedHeight: counts.checks ? 112 : 81, gapBefore: 8,
      overview: { metrics: stats[topic.id], observed: counts.observed, review: counts.review, limited: counts.limited, checks: counts.checks } });
  }

  const a = sections.consent;
  if (cmp) {
    if (cmp.audit.experience?.summary) a.push(...layout.text(cmp.audit.experience.summary));
    a.push(layout.heading("CMP identity and consent choices"), ...pdfEvidenceTable("cmp-identity", ["Retained context", "Detail"], [
      ["Provider", cmp.audit.experience?.provider ?? cmp.provider ?? "Not retained"], ["Consent experience", cmp.audit.experience?.title ?? "Consent choices"],
      ["Assessment source hash", value(cmp.audit.assessmentSourceHash)],
      ...(cmp.audit.inspectionSupport ? [["Preference inspection", `${cmp.audit.inspectionSupport.state}; ${cmp.audit.inspectionSupport.reason}`], ["Inspection recipe", value(cmp.audit.inspectionSupport.recipeVersion)]] : []),
    ], [150, 362]));
    if (controls) a.push(...pdfEvidenceTable("cmp-first-layer-choices", ["First-layer choice", "Retained visit result"], Object.entries(controls.controls).map(([intent, state]) => [label(intent), state === "observed" ? "Observed" : "Not observed"])));
    a.push(layout.heading("CMP audit matrix"), ...pdfEvidenceTable("cmp-matrix", ["Criterion", "Retained result", "Evidence references"], cmp.audit.rows.map(row => [row.label, row.status, row.sourceIds.join(", ") || "Not retained"]), [216, 112, 184]));
    for (const row of cmp.audit.rows) {
      a.push(layout.heading(row.label), ...layout.text(`Result: ${row.status}. ${row.detail ?? ""}`));
      if (row.limitation) a.push(...layout.text(`Inspection limitation: ${label(row.limitation.code)}`, 8));
      const support = row.supportingEvidence;
      const inventory = support?.inventory;
      if (support?.prominence) {
        const geometry = support.prominence;
        a.push(...chart("Accept / Reject fill contrast", [{ label: "Accept", value: geometry.accept.fillContrast }, { label: "Reject", value: geometry.reject.fillContrast }]),
          ...pdfEvidenceTable(`cmp-geometry-${row.id}`, ["Control", "Bounds: x, y, width, height", "Fill contrast / outer emphasis"], [
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
      if (inventory?.expiries?.length) a.push(...pdfEvidenceTable(`cmp-expiry-${row.id}`, ["Capture / cookie", "Domain / path", "Captured / expires / remaining"], inventory.expiries.map(item => [`${item.visit}: ${item.name}`, `${value(item.domain)} ${value(item.path)}`, `${new Date(item.capturedAtEpochSeconds * 1000).toISOString()} / ${new Date(item.expiresAtEpochSeconds * 1000).toISOString()} / ${(item.remainingSeconds / 86400).toFixed(2)} days`]), [150, 150, 212]));
      if (inventory?.consentStorage?.length) a.push(...pdfEvidenceTable(`cmp-consent-storage-${row.id}`, ["Choice", "Consent cookie", "Observed change"], inventory.consentStorage.map(item => [item.visit, item.name, item.change]), [80, 260, 172]));
      if (inventory?.choiceActivity?.length) a.push(...chart("Requests in the retained choice windows", inventory.choiceActivity.flatMap(item => [{ label: `After ${item.action}: all requests`, value: item.requestCount }, { label: `After ${item.action}: non-essential`, value: item.nonEssentialRequestCount }])));
      for (const activity of inventory?.choiceActivity ?? []) {
        a.push(...layout.text(`After ${activity.action}: ${activity.windowMs / 1000} second capture; ${activity.requestCount} total requests; ${activity.nonEssentialRequestCount} non-essential; ${activity.requests.length} request records retained.`, 9),
          ...pdfEvidenceTable(`cmp-activity-${row.id}-${activity.action}`, ["Service / purpose", "Request host and path", "Time after click / classification"], activity.requests.map(item => [`${item.vendor}; ${label(item.purpose)}`, `${item.hostname}${item.path}`, `+${item.msAfterClick} ms; ${item.nonEssential ? "Non-essential" : "Other classified activity"}`]), [145, 227, 140]));
      }
      if (support?.requests?.length) a.push(...pdfEvidenceTable(`cmp-requests-${row.id}`, ["Vendor / purpose", "Request", "After Reject"], support.requests.map(item => [`${item.vendor}; ${item.category}`, `${item.hostname}${item.path}`, `+${item.msAfterReject} ms`]), [145, 257, 110]));
      if (support?.cookieComparison) {
        const c = support.cookieComparison;
        a.push(...pdfEvidenceTable(`cmp-comparison-${row.id}`, ["Comparison fact", "Retained value"], [["Declared patterns", String(c.declarationPatternCount)], ["Observed cookie names", String(c.observedCookieNameCount)], ["Unmatched names", `${c.unmatchedNameCount}: ${c.unmatchedNames.join(", ")}`], ["Possible template names (unverified)", value(c.possibleTemplateNameCount)], ["Omitted After Accept cookies", value(c.omittedAfterAcceptCookieCount)], ["Declaration inventory complete", value(c.declarationInventoryComplete)], ["All unmatched names only after Accept", value(c.allUnmatchedOnlyAfterAccept)]]));
      }
      a.push(...layout.text(`Evidence references: ${row.sourceIds.join(", ") || "Not retained"}`, 8));
    }
  }
  const assessment = report.consentControlAssessment;
  if (assessment && controls) {
    a.push(layout.heading("Retained first-layer control evidence"), ...pdfEvidenceTable("control-evidence", ["Intent / label", "Layer / visibility / actionable", "Timing and evidence"], assessment.evidence.map(item => [
      `${label(item.intent)}: ${value(item.label)}`, `${label(item.layer)}; visible ${value(item.visible)}; actionable ${value(item.actionable)}; ${label(item.presentationType)}; ${label(item.placementType)}; locale ${value(item.locale)}`,
      `${item.observedAtMs} ms; ${item.evidenceId}; ${item.artifactRefs.join(", ")}; document ${value(item.documentId)}; classifier ${value(item.classifier?.registryVersion)}; ${item.classifier?.reasonCodes.join(", ") ?? ""}`,
    ]), [180, 152, 180]), ...layout.text(`Assessment ${assessment.artifactVersion}; source ${assessment.provenance.sourceHash}; computed ${assessment.provenance.computedAt}.`, 8));
  }

  sections.storage.push(...chart("Cookie and storage purposes", distribution(runtime.rows.filter(row => row.type === "cookie" || row.type === "storage").flatMap(row => row.purpose))));
  sections.external.push(...chart("Service / tracker purposes", distribution(runtime.rows.filter(row => row.type !== "cookie" && row.type !== "storage").flatMap(row => row.purpose))));
  sections.forms.push(...chart("Field categories", distribution(collection.forms.flatMap(form => form.fields.map(field => label(field.semanticCategory))))));
  const trace = dossier?.formDestinations;
  if (trace) {
    const d = sections.forms;
    d.push(layout.heading("Form events and destinations"));
    for (const event of trace.trace.events) d.push(...pdfEvidenceTable(`form-event-${event.evidenceRef}; document ${event.documentUrl}; ${event.documentToken}`, ["Event", "Declared destination", "Fields and evidence"], [[`${event.kind} at ${event.observedAtMs} ms; form ${event.formIndex + 1}`, event.actionUrl, `${event.fields.map(field => `${field.name}: ${field.category}; personal ${value(field.personal)} (${field.evidenceRef})`).join("; ")}; ${event.evidenceRef}`]], [130, 180, 202]));
    d.push(...pdfEvidenceTable("form-destination-requests", ["Request / recipient", "Retained relationship", "Timing / evidence"], trace.trace.requests.map(request => [
      `${request.method} ${request.url}; ${request.party}`, `${label(request.status)}; ${request.relation === "exact_field_value_match" ? "Exact field-value match" : "Timing association only"}; outside declared destination: ${value(request.outsideDeclaredDestination)}`,
      `${request.observedAtMs} ms; ${request.evidenceRef}; event ${request.eventRef}; network ${request.networkRequestId}; matched fields ${request.matches.map(match => match.fieldRef).join(", ")}`,
    ]), [190, 160, 162]), ...layout.text(`Verified source hash: ${trace.sourceHash}. Unsupported payloads: ${trace.trace.coverage.unsupportedPayloads}; capture truncated: ${value(trace.trace.coverage.truncated)}.`, 8));
  }
  if (cms) {
    const e = sections.security;
    e.push(layout.heading("CMS, versions and plugins"), ...pdfEvidenceTable("cms-detections", ["Platform", "Retained version", "Identification evidence"], cms.assessment.detections.map(item => [item.name, cmsEvidenceVersionLabel(item), `${item.evidenceRefs.join(", ")}; ${item.versionBasis}; ${item.versionStatus}; confidence ${item.confidence}; observed versions ${item.observedVersions.join(", ")}; runtime version confirmed ${value(item.runtimeVersionConfirmed)}`]), [145, 155, 212]));
    e.push(...pdfEvidenceTable("cms-plugins", ["Plugin", "Version / state", "Evidence references"], (cms.pluginInventory?.detections ?? []).map(item => [item.name, `${item.version ?? "Not detected"}; ${item.versionStatus}; observed versions ${item.observedVersions.join(", ")}`, item.evidenceRefs.join(", ")]), [180, 140, 192]));
    for (const match of cms.assessment.matches) e.push(...layout.text(`${match.record.id}: ${match.record.title}. ${match.record.qualification ?? ""}`, 9),
      ...layout.text(`Vendor fixes: ${match.record.fixedVersions?.join(", ") || "Not retained"}. Source: ${match.record.sourceUrl}. Evidence ${match.evidenceRef}; detection ${match.detectionRef}; confidence ${match.confidence}; matched range ${match.matchedRange}.`, 8));
    e.push(...pdfEvidenceTable("cms-signals", ["Identification source", "Retained value", "Source URL / evidence"], cms.signals.map(item => [label(item.kind), item.value, `${item.sourceUrl}; ${item.evidenceRef}; ${item.artifactRef}`]), [120, 210, 182]), ...layout.text(`Captured: ${cms.capturedAt}; source hash: ${cms.sourceHash}; evidence: ${cms.evidenceRef}.`, 8));
  }
  if (report.accessibilityEvidence) sections.accessibility.push(...chart("Affected nodes by automated rule", report.accessibilityEvidence.violations.map(rule => ({ label: rule.ruleId, value: rule.nodeCount }))));

  for (const item of dossier?.checklistDetails ?? []) {
    const destination = sections[item.topic ?? "policy"];
    if (!item.facts.length && !item.subchecks.length && !item.evidenceRefs.length) continue;
    destination.push(layout.heading(`Evidence: ${item.label}`), ...layout.text(`${item.status}. ${item.explanation}`, 9));
    if (item.facts.length) destination.push(...pdfEvidenceTable(`checklist-facts-${item.id}`, ["Retained evidence", "Detail"], item.facts.map(fact => [label(fact.label), fact.value]), [165, 347]));
    if (item.subchecks.length) destination.push(...pdfEvidenceTable(`checklist-subchecks-${item.id}`, ["Check", "Status", "Evidence / note"], item.subchecks.map(check => [check.label, check.status, `${check.note}; ${check.evidenceRefs.join(", ")}`]), [180, 110, 222]));
    destination.push(...layout.text(`Evidence references: ${item.evidenceRefs.join(", ") || "Not retained"}`, 8));
  }
  for (const finding of findings) {
    const packet = finding.evidence as { snippets?: string[]; sourceUrls?: string[]; pageUrls?: string[]; counts?: Record<string, number>; entities?: Record<string, string[]> } | undefined;
    if (!packet) continue;
    const rows = [
      ...(packet.pageUrls ?? []).map(url => ["Affected page", url]), ...(packet.sourceUrls ?? []).map(url => ["Source URL", url]),
      ...(packet.snippets ?? []).filter(snippet => !/deduction|scoring withheld|point penalty/i.test(snippet)).map(snippet => ["Retained excerpt", snippet]),
      ...Object.entries(packet.counts ?? {}).filter(([key]) => !/score|deduct|point/i.test(key)).map(([key, count]) => [label(key), String(count)]),
      ...Object.entries(packet.entities ?? {}).map(([key, values]) => [label(key), values.join(", ")]),
    ];
    if (rows.length) sections[pdfTopicForFinding(finding) ?? "policy"].push(layout.heading(`Finding evidence: ${value(finding.title ?? finding.unifiedFindingId)}`), ...pdfEvidenceTable(`finding-evidence-${finding.unifiedFindingId}`, ["Evidence type", "Retained detail"], rows, [135, 377]));
  }
  return sections;
}
