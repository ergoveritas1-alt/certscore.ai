import { reportRequestInventory } from "./report-request-inventory";
import { REPORT_EXPORT_DISCLAIMER } from "./report-export-footer";
import { REPORT_TRANSPORT_CHECKS } from "../../lib/scans/report-runtime-inventory";
import { pdfPriorityReview, pdfPrioritySourceIds } from "./report-pdf-priorities";
import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { pdfChoiceWindows, pdfConfidenceLabel, pdfRegionLabel, pdfTestedUrl, reportFormInventory } from "./report-pdf-reader";
import { reportFormPhaseLabel } from "../../lib/scans/report-form-inventory";
import { pdfDisplayTopic, pdfTopicForFinding } from "./report-pdf-topics";
import { assertPublicReportPdfContent, publicReportPdfBaseUrl } from "./report-pdf-public-safety";
import { pdfTimeZone } from "./report-pdf-time";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import type { CanonicalReportExport } from "./report-export";
import { REPORT_STATUS_LABELS, REPORT_FOLLOW_UP, accessibilityReportFollowUp } from "../../lib/scans/report-status-presentation";
import { reportFindingSummary } from "../../lib/scans/report-finding-summary";
export type PdfV2Status = "Observed" | "Needs review" | "Review" | "Partial" | "Manual review" | "Not observed" | "Not applicable" | "For information" | "Not tested";
export type PdfV2Block = {
    kind: "text";
    text: string;
    muted?: boolean;
} | {
    kind: "heading";
    text: string;
} | {
    kind: "table";
    title: string;
    headers: string[];
    rows: string[][];
    mono?: number[];
    widths?: number[];
    highlight?: number[];
    compact?: boolean;
    excerptColumns?: number[];
} | {
    kind: "image";
    role: "capture";
    caption: string;
} | {
    kind: "timeline";
    title: string;
    windowMs: number;
    events: Array<{
        time: number;
        nonEssential: boolean;
    }>;
};
export type PdfV2Issue = {
    id: string;
    title: string;
    tier: "Verify first" | "Review" | "For information";
    impact: string;
    confidence: string;
    findingIds: string[];
    findingNumbers: number[];
    summary: string;
    owner: string;
    evidenceTarget: string;
    blocks: PdfV2Block[];
    expected: string;
    steps: string[];
};
export type PdfV2Section = {
    id: string;
    title: string;
    shortTitle: string;
    status: PdfV2Status;
    summary: string;
    coverage: string;
    blocks: PdfV2Block[];
};
type RecordValue = Record<string, unknown>;
const obj = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const scalar = (v: unknown) => v === undefined || v === null ? "Not recorded" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
const unique = <T>(v: T[]) => [...new Set(v)];
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
/** Presentation wording only. Never changes a canonical assessment or evidence. */
export function pdfV2Words(value: unknown) {
    return scalar(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\bNot Not retained\b/gi, "Not recorded").replace(/\bretained\b/gi, "recorded").replace(/<\s*(\d+)ms\b/g, "<$1 ms")
        .replace(/\bnot_detected\b/g, "Not observed").replace(/\bunknown_or_partial\b/g, "Partial").replace(/\s+/g, " ").trim();
}
export function pdfV2Status(value: unknown): PdfV2Status {
    const v = str(value).toLowerCase();
    if (v === "observed" || v === "verified" || v === "checked")
        return "Observed";
    if (v.includes("manual"))
        return "Manual review";
    if (v.includes("not applicable") || v === "not_applicable")
        return "Not applicable";
    if (v.includes("not observed") || v === "not_observed" || v === "not_detected")
        return "Not observed";
    if (v.includes("partial") || v.includes("insufficient") || v.includes("limited"))
        return "Partial";
    if (v.includes("review") || v.includes("gap") || v.includes("concern"))
        return "Review";
    return "Not tested";
}
const purpose = (v: unknown) => ({ analytics: "Analytics", advertising: "Advertising", marketing: "Marketing", session_replay: "Session replay", tag_management: "Tag management", consent_management: "Consent management", infrastructure: "Infrastructure", security: "Security", functional: "Functional", tracking: "Tracking", unknown: "Purpose unresolved" }[str(v)] ?? pdfV2Words(v));
const titleAliases: Record<string, string> = { accept_reject_outcomes_indistinguishable: "Accept and Reject activity overlaps", post_accept_consent_dependent_activity: "Activity after Accept", post_reject_click_tracking: "Non-essential activity after Reject", post_refusal_non_essential_activity: "Non-essential activity after Reject" };
const table = (title: string, headers: string[], rows: string[][], extra: Partial<Extract<PdfV2Block, {
    kind: "table";
}>> = {}): PdfV2Block => ({ kind: "table", title, headers, rows, ...extra });
const text = (v: string, muted = false): PdfV2Block => ({ kind: "text", text: pdfV2Words(v), muted });
const heading = (v: string): PdfV2Block => ({ kind: "heading", text: v });
const date = (v: unknown, tz: string, includeTime = false) => {
    if (!v || !Number.isFinite(new Date(String(v)).getTime()))
        return "Not recorded";
    const instant = new Date(String(v));
    const formatted = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" } : {}) }).format(instant);
    const shortZone = includeTime ? new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(instant).find(part => part.type === "timeZoneName")?.value : null;
    return shortZone ? formatted.replace(/(?:GMT[+-][\d:]+|UTC|GMT)$/, shortZone) : formatted;
};
const expiry = (v: unknown, tz: string) => typeof v === "number" && Number.isFinite(v) ? date(new Date(v * 1000).toISOString(), tz) : "Not recorded";
const cleanSummary = (v: unknown) => reportFindingSummary(pdfV2Words(v));
/** Local v2 view over the frozen canonical export. No raw bundle input, no
 * classifier, scoring, receipt inference, network request or state mutation. */
export function buildReportPdfV2Model(report: CanonicalReportExport, options: {
    brandName?: string;
    timeZone?: string;
    appUrl?: string;
} = {}) {
    if (report.artifactType !== "certscore_canonical_report_export" || report.artifactVersion !== "canonical-report-export-v8")
        throw new Error("A canonical v8 report export is required.");
    if (report.reviewFocus !== "gdpr_eprivacy" || report.score.scope !== "starting_page")
        throw new Error("The local v2 preview currently supports starting-page GDPR/ePrivacy reports only.");
    if (report.consentControlAssessment && report.consentControlAssessment.scan.scanId !== report.scan.id)
        throw new Error("Consent assessment belongs to a different scan.");
    if (report.gpcResponse?.contractVersion === "certscore.gpc-response-assessment.v3" && report.gpcResponse.observation && report.gpcResponse.observation.scanId !== report.scan.id)
        throw new Error("GPC evidence belongs to a different scan.");
    const before = JSON.stringify(report), tz = pdfTimeZone(options.timeZone) ?? "UTC", base = publicReportPdfBaseUrl(options.appUrl), diagnostics: string[] = [];
    const auditRows = report.appendix.evidenceDossier?.cmp?.audit.rows ?? [];
    const windows = pdfChoiceWindows(report), accept = windows.find(v => v.action === "accept"), reject = windows.find(v => v.action === "reject");
    const inventory = report.appendix.cookieAndTrackerInventory, forms = report.appendix.dataCollectionSurfaces, details = report.appendix.evidenceDossier?.checklistDetails ?? [];
    const formInventory = reportFormInventory(report);
    const initialRequests = reportRequestInventory(report);
    const inventoryOf = (key: string) => auditRows.flatMap(row => arr(obj(row.supportingEvidence?.inventory)[key]).map(obj));
    const cookies = inventoryOf("cookies"), declarations = inventoryOf("declarations"), services = inventoryOf("services"), categories = inventoryOf("categories");
    const comparison = auditRows.find(row => row.supportingEvidence?.cookieComparison)?.supportingEvidence?.cookieComparison;
    const findings = pdfNarrativeFindings(report).map((f, i) => ({ id: str(f.unifiedFindingId), number: i + 1, title: titleAliases[str(f.unifiedFindingId)] ?? pdfV2Words(obj(f.presentation).findingName ?? f.title),
        summary: cleanSummary(f.summary), impact: pdfV2Words(f.severity), confidence: pdfConfidenceLabel(obj(f.presentation).confidenceScore),
        action: pdfV2Words(obj(f.presentation).suggestedFix), topic: pdfDisplayTopic(pdfTopicForFinding(f)), packet: f }));
    const issues: PdfV2Issue[] = [];
    const refusal = findings.find(f => ["post_reject_click_tracking", "post_refusal_non_essential_activity"].includes(f.id));
    const overlap = findings.find(f => f.id === "accept_reject_outcomes_indistinguishable");
    const requestName = (r: {
        vendor: string;
        hostname: string;
    }) => r.vendor === "Unidentified" ? r.hostname : r.vendor;
    const times = (action: typeof accept, request: {
        hostname: string;
        path: string;
    }) => action?.requests.filter(r => r.hostname === request.hostname && r.path === request.path).map(r => `+${r.msAfterClick} ms`).join(", ") || "Not observed in sample";
    if (refusal) {
        const requests = reject?.requests.filter(r => r.nonEssential) ?? [];
        const vendors = unique(requests.map(requestName));
        const blocks: PdfV2Block[] = [];
        for (const vendor of vendors)
            blocks.push(table(`${vendor}: observed request samples`, ["Request", "Purpose", "After Reject click", "After Accept click"], requests.filter(r => requestName(r) === vendor).map(r => [`${r.hostname}${r.path}`, purpose(r.purpose), `+${r.msAfterClick} ms`, times(accept, r)]), { mono: [0], widths: [.44, .16, .18, .22] }));
        const timing = report.appendix.evidenceDossier?.rejectTiming;
        if (timing)
            blocks.push(text(`${timing.storageWriteCount} classified non-essential storage-write events and ${timing.networkRequestCount} request events are recorded in the original post-Reject assessment. Storage events are separate from request counts.`));
        if (overlap)
            blocks.push(text("Some recorded activity identities also appear after Accept. This is partial overlap, not equivalent outcomes; query values are sanitized and observation windows can differ."));
        if (accept && reject && accept.windowMs !== reject.windowMs)
            blocks.push(text(`Observed windows: Accept ${(accept.windowMs / 1000).toFixed(1)} s; Reject ${(reject.windowMs / 1000).toFixed(1)} s. Raw event totals do not establish comparable rates or overall equivalent outcomes.`, true));
        issues.push({ id: "issue-refusal", title: refusal.title, tier: refusal.confidence.startsWith("Limited") ? "Verify first" : "Review", impact: refusal.impact, confidence: refusal.confidence,
            findingIds: [refusal.id, ...(overlap ? [overlap.id] : [])], findingNumbers: [refusal.number, ...(overlap ? [overlap.number] : [])],
            summary: reject ? `${reject.nonEssentialRequestCount} classified non-essential requests were recorded after the Reject click, including ${vendors.join(" and ") || "unattributed activity"}. ${refusal.summary}` : refusal.summary,
            owner: "Developer + CMP owner", evidenceTarget: "choice-reject", blocks,
            expected: "New consent-dependent requests and writes follow the visitor's applicable choice. Essential activity and the saved choice remain available.",
            steps: ["Reproduce the recorded Reject path in staging. Filter Network for the exact endpoints shown here and inspect their Initiator and consent settings.", "Verify the purpose and effective choice handling of the listed integrations; correct confirmed optional loaders or writers, then repeat the same path."] });
    }
    for (const f of findings) {
        if (f === refusal || f === overlap && refusal)
            continue;
        const informational = f.id === "post_accept_consent_dependent_activity";
        const signals = arr(obj(obj(f.packet.evidence).entities).policyBoilerplateSignals).map(v => ({ generic_log_files: "Generic log-file wording", generic_iframe_clause: "Generic iframe wording", gdpr_template: "Template-style GDPR wording" }[str(v)] ?? "Policy wording review signal"));
        const blocks: PdfV2Block[] = [];
        if (signals.length)
            blocks.push(text(`Recorded review markers: ${signals.join("; ")}. These markers support review, not a finding that a template is inherently invalid.`));
        const urls = arr(obj(f.packet.evidence).pageUrls).filter(v => typeof v === "string") as string[];
        if (urls.length)
            blocks.push(text(`Source: ${urls.join("; ")}`));
        if (f.id === "policy_clarity_risk")
            diagnostics.push("Policy clarity markers are retained, but exact marker-to-passage ranges are absent; no invented highlighted passage or cookie-disclosure issue was added.");
        issues.push({ id: `issue-${f.number}`, title: f.title, tier: informational ? "For information" : f.confidence.startsWith("Limited") ? "Verify first" : "Review", impact: f.impact, confidence: f.confidence,
            findingIds: [f.id], findingNumbers: [f.number], summary: informational && accept ? `${accept.nonEssentialRequestCount} classified non-essential request events were recorded in the ${(accept.windowMs / 1000).toFixed(1)} s Accept window. This is the recorded comparison baseline.` : f.summary,
            owner: informational ? "Comparison baseline" : f.topic === "policy" ? "Privacy owner + webmaster" : "Responsible system owner", evidenceTarget: informational ? "choice-accept" : ({ consent: "consent", policy: "policy", storage: "storage", forms: "forms-security", security: "forms-security", external: "external", accessibility: "accessibility" } as Record<string, string>)[f.topic ?? ""] ?? "methodology", blocks,
            expected: informational ? "Use this recorded baseline when checking that a repair preserves intended Accept behavior." : f.topic === "policy" ? "Public wording describes the actual data practice clearly and remains consistent with the applicable implementation." : f.action,
            steps: informational ? [] : [f.action] });
    }
    const covered = issues.flatMap(v => v.findingIds);
    if (covered.length !== findings.length || new Set(covered).size !== findings.length)
        throw new Error("Every selected canonical finding must be covered exactly once.");
    const metric = (label: string, value: unknown, note: string) => ({ label, value: scalar(value), note });
    const preCounts = inventory.summary.inventoryMetrics ?? [];
    const preStorage = preCounts.find(m => m.label === "Cookies & storage");
    const preNonEssential = inventory.presentationStatus !== "insufficient_evidence" && typeof preStorage?.counts?.nonEssential === "number" ? preStorage.counts.nonEssential : null;
    const preServiceRows = inventory.rows.filter(r => r.preConsent && r.type !== "cookie" && r.type !== "storage");
    const policyRows = report.appendix.gdprTransparency.rows;
    const priorityReview = pdfPriorityReview(report);
    const priorities = priorityReview.topIssues;
    const narrativeIssues = [...issues];
    const priorityIssues = priorities.map(priority => {
        const sourceIds = pdfPrioritySourceIds(priority);
        const original = narrativeIssues.find(issue => issue.findingIds.some(id => sourceIds.includes(id)));
        const id = `priority-${priority.id}`;
        return { ...(original ?? { tier: "Review" as const, impact: priority.severity ?? "Not recorded", confidence: "Confidence not established", findingIds: [], findingNumbers: [], owner: "Review owner", evidenceTarget: "consent", blocks: [], expected: "Verify the recorded finding using the retained examples.", steps: priority.correctionSteps }),
            id, title: priority.title, summary: priority.summary, priorityId: priority.id,
            ...(priority.correctionSteps.length ? { steps: priority.correctionSteps } : {}),
        };
    });
    const otherIssues = narrativeIssues.filter(issue => !priorityIssues.some(priority => priority.findingIds.some(id => issue.findingIds.includes(id))));
    issues.splice(0, issues.length, ...priorityIssues);
    const allIssues = [...issues, ...otherIssues];
    const policySources = unique(details.filter(d => d.topic === "policy").flatMap(d => d.facts.filter(f => ["sourceUrl", "selectedPolicySectionUrl", "Policy provenance / sourceUrl"].includes(f.label)).map(f => f.value)));
    const sections: PdfV2Section[] = [];
    const section = (id: string, title: string, status: PdfV2Status, summary: string, coverage: string, blocks: PdfV2Block[]) => sections.push({ id, title, shortTitle: title, status, summary, coverage, blocks });
    const consentSummary = `${report.appendix.evidenceDossier?.cmp?.provider ?? "CMP identity not recorded"}. ${auditRows.length} assessed checks; captured controls and settings are listed below.`;
    const consentStatus: PdfV2Status = refusal ? "Needs review" : !auditRows.length ? "Not tested" : auditRows.some(r => pdfV2Status(r.status) !== "Observed") ? "Partial" : "Observed";
    section("consent", "A · CMP and consent", consentStatus, consentSummary, "First-layer and preference inventories are bounded; listing a control does not prove choice registration.", [
        table("A.1 Banner and consent audit", ["Check", "Assessment", "Evidence excerpt"], auditRows.map(row => [row.label, pdfV2Status(row.status), pdfV2Words(row.detail)]), { widths: [.30, .15, .55], compact: true }),
        table("A.2 First-layer controls", ["Label on screen", "Read as", "Visible / actionable"], unique((report.consentControlAssessment?.evidence ?? []).map(e => JSON.stringify([e.label, e.intent, e.visible, e.actionable]))).map(s => { const [label, intent, visible, actionable] = JSON.parse(s); return [pdfV2Words(label), ({ accept: "Accept", reject: "Reject", options: "Settings" } as Record<string, string>)[intent] ?? "Unresolved", `${scalar(visible)} / ${scalar(actionable)}`]; }), { widths: [.54, .18, .28] }),
    ]);
    const allRequests = windows.flatMap(w => w.requests.map(r => ({ ...r, action: w.action })));
    const serviceStates = (name: string) => {
        const states: string[] = [];
        if (preServiceRows.some(r => r.vendor.toLowerCase() === name.toLowerCase() || (r.products ?? []).some(p => p.toLowerCase() === name.toLowerCase())))
            states.push("Before a choice");
        for (const action of ["accept", "reject"] as const)
            if (allRequests.some(r => r.action === action && r.vendor.toLowerCase() === name.toLowerCase()))
                states.push(action === "accept" ? "After Accept" : "After Reject");
        return states.join("; ") || "Not linked in this export";
    };
    const geometry = auditRows.find(r => r.supportingEvidence?.prominence)?.supportingEvidence?.prominence;
    section("cmp-inventory", "A.3 · CMP inventory and prominence", services.length || categories.length ? "Partial" : "Not tested", "Services and categories are reproduced as declared by the CMP; they are separate from observed network activity.", "Per-service toggles were not exercised by this report view.", [
        table("Services declared in the CMP", ["Declared service", "Matched observed activity"], services.map(s => [str(s.name), serviceStates(str(s.name))]), { widths: [.35, .65] }),
        text("A missing exact attribution is not proof that a declared service is unused. Service aliases are not guessed in this PDF.", true),
        table("Categories offered", ["Category", "Recorded default"], categories.map(c => [str(c.name), c.checked === true ? "On" : c.checked === false ? "Off" : "Unresolved"])),
        ...(geometry ? [table("Recorded button prominence", ["Control", "x, y, width, height", "Fill contrast / outer emphasis"], [["Accept", geometry.accept.bounds.join(", "), `${geometry.accept.fillContrast} / ${geometry.accept.outerEmphasisFraction}`], ["Reject", geometry.reject.bounds.join(", "), `${geometry.reject.fillContrast} / ${geometry.reject.outerEmphasisFraction}`]], { widths: [.16, .40, .44] }), text(`Capture skew ${geometry.captureSkewMs} ms. The saved prominence assessment is shown in the banner audit.`)] : []),
    ]);
    section("cookie-comparison", "A.4 · Observed cookies and declarations", "Partial", `${cookies.length} cookie names and ${declarations.length} declared patterns are recorded in the CMP comparison.`, comparison?.declarationInventoryComplete ? "The recorded declaration inventory is marked complete for this scope." : "The declaration inventory is incomplete; an unmatched name does not prove an absent declaration.", [
        table("Observed cookies across choice states", ["Cookie name", "Captured declaration match", "States seen", "Observed expiry"], cookies.map(c => [str(c.name), str(c.matchedPattern) || (c.possibleTemplateMatch ? "Possible template match only" : "No match in captured declarations"), arr(c.observedIn).map(v => ({ before_choice: "Before a choice", after_accept: "After Accept", after_reject: "After Reject" }[str(v)] ?? "State unresolved")).join(", "), expiry(obj(c.observedExpiry).expiresAtEpochSeconds, tz)]), { mono: [0], widths: [.26, .30, .24, .20] }),
        text("An observed expiry and a CMP-stated retention period describe different evidence. They do not by themselves prove a retention violation.", true),
    ]);
    section("declarations", "A.4 · Cookie declarations", declarations.length ? "Observed" : "Not tested", `${declarations.length} declared entries, with purpose and retention as stated by the site.`, "Names are reproduced literally. No declaration is labeled invalid solely because it lacks a registry or observation match.", [
        table("Declared cookie patterns", ["Cookie / pattern", "CMP-stated purpose", "CMP-stated retention", "Observed matching name"], declarations.map(d => [str(d.name), purpose(d.purpose), pdfV2Words(d.duration || "Not stated"), cookies.filter(c => c.matchedPattern === d.name).map(c => str(c.name)).join(", ") || "Not observed in comparison"]), { mono: [0], widths: [.33, .17, .19, .31], compact: true }),
    ]);
    const requestRows = (w: typeof accept) => w?.requests.map(r => [`+${r.msAfterClick} ms`, `${requestName(r)} · ${purpose(r.purpose)}`, `${r.hostname}${r.path}`, r.nonEssential ? "Non-essential" : "Other recorded activity"]) ?? [];
    const execution = (action: "accept" | "reject") => action === "accept" ? report.postAcceptObservation?.execution : report.postRefusalObservation && "execution" in report.postRefusalObservation ? report.postRefusalObservation.execution : undefined;
    section("choice-reject", "A.5 · Choice sessions and Reject", refusal ? "Needs review" : "Partial", "Choice completion, decision confirmation, network events and storage evidence are separate measurements.", "Times in request tables are relative to the click, as recorded; they are not relabeled as confirmation-relative.", [
        table("Choice-session comparison", ["Measurement", "After Accept", "After Reject"], [
            ["Click", ...(["accept", "reject"] as const).map(a => execution(a) ? execution(a)!.clickCompleted ? "Completed" : "Incomplete" : "Not recorded")],
            ["Decision registration", ...(["accept", "reject"] as const).map(a => execution(a) ? execution(a)!.consentConfirmed ? "Confirmed by stored assessment" : "Unconfirmed" : "Not recorded")],
            ["Measured window", accept ? `${accept.windowMs / 1000} s` : "Not recorded", reject ? `${reject.windowMs / 1000} s` : "Not recorded"],
            ["Recorded requests", scalar(accept?.requestCount), scalar(reject?.requestCount)],
            ["Classified non-essential requests", scalar(accept?.nonEssentialRequestCount), scalar(reject?.nonEssentialRequestCount)],
            ["Detailed request rows", scalar(accept?.requests.length), scalar(reject?.requests.length)],
        ], { widths: [.40, .30, .30] }),
        ...(reject ? [{ kind: "timeline" as const, title: "Requests after the Reject click", windowMs: reject.windowMs, events: reject.requests.map(r => ({ time: r.msAfterClick, nonEssential: r.nonEssential })) }] : []),
        table("Requests after the Reject click", ["Start", "Vendor / purpose", "Recorded request", "Classification"], requestRows(reject), { mono: [2], widths: [.13, .24, .43, .20], compact: true }),
        text(reject && reject.requests.length < reject.requestCount ? "Detailed rows are a bounded sample; totals include additional recorded events." : "All request rows recorded in this exported session inventory are shown.", true),
    ]);
    section("choice-accept", "A.5 · Accept session", "For information", "The Accept session is a recorded comparison baseline, not evidence that every service is necessary or every other choice works.", "Fresh independent session; sample classifications are preserved as recorded.", [
        table("Requests after the Accept click", ["Start", "Vendor / purpose", "Recorded request", "Classification"], requestRows(accept), { mono: [2], widths: [.13, .24, .43, .20], compact: true }),
        text(accept && accept.requests.length < accept.requestCount ? "Detailed rows are a bounded sample; totals include additional recorded events." : "All request rows recorded in this exported session inventory are shown.", true),
    ]);
    section("capture", "A.6 · Consent surface capture", "For information", "The captured first-layer consent surface supplies context for the recorded controls.", "The screenshot is separate from click completion and decision-registration evidence.", [
        { kind: "image", role: "capture", caption: "Captured first-layer consent surface, reproduced from the saved report." },
    ]);
    const preCookies = inventory.rows.filter(r => r.preConsent && (r.type === "cookie" || r.type === "storage"));
    const storageStatus: PdfV2Status = inventory.presentationStatus === "insufficient_evidence" ? "Partial" : "Observed";
    section("storage", "B · Cookies and browser storage", storageStatus, `${inventory.presentationStatus === "insufficient_evidence" ? "Cookie/storage inventory unavailable" : `${preCookies.length} cookie/storage inventory rows were recorded before a choice`}. Post-choice cookie names are listed separately in Appendix A.4.`, "Snapshot presence, an observed write and active use are distinct. This report does not infer a new write from presence alone.", [
        table("Before a choice", ["Cookie / storage item", "Recorded purpose", "First seen", "Recorded classification"], preCookies.map(r => [r.cookieNames.join(", ") || r.resourceNames.join(", "), r.purpose.join(", "), r.firstSeenMs === null ? "Not recorded" : `${r.firstSeenMs / 1000} s`, pdfV2Words(r.evidenceClassification)]), { mono: [0], widths: [.31, .31, .13, .25] }),
        table("State coverage", ["State", "Inventory"], [["Before a choice", `${preCookies.length} inventory rows`], ["After Accept", `${cookies.filter(c => arr(c.observedIn).includes("after_accept")).length} cookie names in the CMP comparison`], ["After Reject", `${report.appendix.evidenceDossier?.rejectTiming?.storageWriteCount ?? "Not recorded"} storage-write events in the post-Reject assessment`]]),
    ]);
    const policyFacts = (id: string) => details.find(d => d.id === id)?.facts ?? [];
    const fact = (id: string, labels: string[]) => policyFacts(id).find(f => labels.includes(f.label))?.value ?? "";
    const policyStatus: PdfV2Status = findings.some(f => f.topic === "policy") ? "Needs review" : policyRows.length ? "Observed" : "Not tested";
    section("policy", "C · Privacy policy", policyStatus, `${policyRows.filter(r => r.status === "Observed").length} of ${policyRows.length} disclosure rows contain observed text. Text presence does not establish completeness or legal adequacy.`, "Excerpts are shortened; full passages remain in the JSON workpaper. Disclosure presence and adequacy are distinct.", [
        table("C.1 Disclosure evidence", ["Disclosure", "Saved assessment", "Source", "Recorded excerpt"], policyRows.map(r => [r.label, pdfV2Status(r.status), (() => { const url = fact(r.id, ["selectedPolicySectionUrl", "sourceUrl", "Policy provenance / sourceUrl"]); return policySources.includes(url) ? `S${policySources.indexOf(url) + 1}` : "Not recorded"; })(), fact(r.id, ["evidenceText", "selectedPolicySectionExcerpt", "candidatePolicyExcerpt"]) || pdfV2Words(r.rationale)]), { widths: [.25, .15, .08, .52], excerptColumns: [3] }),
        heading("C.2 Policy-clarity review"), text(findings.find(f => f.id === "policy_clarity_risk")?.summary ?? "No policy-clarity finding was projected."),
        table("C.3 Recorded source URLs", ["Source"], policySources.map((u, i) => [`S${i + 1}: ${u}`]), { mono: [0] }),
    ]);
    const security = details.filter(d => REPORT_TRANSPORT_CHECKS.some(([, id]) => id === d.id));
    section("forms-security", "D · Forms / E · Transport security", formInventory.totalForms ? "Observed" : security.length ? "Observed" : "Not tested", `${formInventory.totalForms} form observations and ${formInventory.totalFields} retained fields. Initial page: ${formInventory.initialForms ?? "unavailable"}; after Accept: ${formInventory.afterAcceptForms ?? "unavailable in this export"}. ${formInventory.limited ? formInventory.hasCombinedInventory ? "Form coverage is limited; additional forms may not have been captured. " : "Form inventory coverage is partial or unavailable. " : ""}No form was submitted.`, "Form observations retain their capture phase. Initial-page coverage does not describe later captures. HTTPS checks are not a full server-security audit.", [
        table("D · Form scope", ["Measurement", "Recorded value"], [["Form observations", String(formInventory.totalForms)], ["Initial-page forms", scalar(formInventory.initialForms)], ["After Accept forms", scalar(formInventory.afterAcceptForms)], ["Retained fields", String(formInventory.totalFields)], ["Initial-page inventory coverage", pdfV2Words(forms.coverage?.status)], ["After Accept coverage", formInventory.summary?.afterAcceptCapture === "limited" ? "Limited" : formInventory.summary?.afterAcceptCapture === "retained" ? "Recorded" : "Unavailable in this export"]]),
        ...formInventory.rows.flatMap((row, index) => [heading(`D.${index + 1} Form ${index + 1} · ${reportFormPhaseLabel(row)}`), text(`${row.form.title ?? row.form.surfaceType.replaceAll("_", " ")} · ${row.form.pageUrl}. Method: ${row.form.method}; action: ${row.form.actionHostname ?? row.form.actionRelationship}. ${row.form.fields.length} retained ${row.form.fields.length === 1 ? "field" : "fields"}.${row.captureLimited ? " Capture was limited." : ""}`),
          table(`Form ${index + 1} fields`, ["Label", "Element / type", "Recorded category", "Required / state"], row.form.fields.map(field => [field.label ?? "Label not retained", `${field.elementType} / ${field.inputType ?? "Not recorded"}`, field.semanticCategory.replaceAll("_", " "), `${field.required ? "Required" : "Not required"}; ${field.disabled ? "disabled" : field.readOnly ? "read-only" : "available"}`]), { widths: [.28, .20, .27, .25] })]),
        table("E.1 Transport assessments", ["Check", "Saved assessment", "Evidence"], security.map(d => [d.label, pdfV2Status(d.status), pdfV2Words(d.explanation)]), { widths: [.25, .16, .59], compact: true }),
        table("E.2 Certificate facts", ["Recorded fact", "Value"], security.filter(d => d.id === "transport_security_tls_certificate").flatMap(d => d.facts.filter(f => /\/ (subject|issuer|validFrom|validTo|chainCertificateCount)$/.test(f.label)).map(f => [f.label.split(" / ").at(-1)!.replace(/([a-z])([A-Z])/g, "$1 $2"), f.value])), { widths: [.32, .68], compact: true }),
        table("Recorded HTTP redirect sequence", ["Sequence / destination"], security.filter(d => d.id === "transport_security_http_redirect").flatMap(d => d.facts.filter(f => f.label.startsWith("httpProbeRedirectChain")).map(f => [f.value])), { mono: [0], compact: true }),
    ]);
    const cms = report.appendix.evidenceDossier?.cmsSecurity;
    if (cms)
        sections.at(-1)!.blocks.push(table("E.3 Software observed", ["Component", "Version", "Identification basis"], [...cms.assessment.detections.map(d => [d.name, d.version ?? "Not detected", pdfV2Words(d.versionBasis).replaceAll("_", " ")]), ...(cms.pluginInventory?.detections ?? []).map(d => [d.name, d.version ?? "Not detected", "Recorded plugin inventory"])], { widths: [.30, .20, .50] }));
    const domains = unique(allRequests.map(r => r.hostname)).sort();
    const conflicts = domains.filter(host => { const rows = allRequests.filter(r => r.hostname === host); return rows.some(a => rows.some(b => a.action !== b.action && a.path === b.path && a.nonEssential !== b.nonEssential)); });
    if (conflicts.length)
        diagnostics.push(`Recorded request classification differs across states for ${conflicts.join(", ")}; no PDF-side reclassification or count rewrite performed.`);
    const externalStatus: PdfV2Status = refusal ? "Needs review" : initialRequests || preServiceRows.length || allRequests.length ? "Observed" : "Not tested";
    section("external", "F · Services and domains", externalStatus, initialRequests ? `${initialRequests.metric!.value} request events and ${initialRequests.totalResources} distinct request resources before a choice; ${domains.length} distinct hosts across recorded choice-session samples.` : `${preServiceRows.length} pre-choice service rows and ${domains.length} distinct request hosts across the recorded choice-session samples. These denominators are separate.`, "Before-choice inventory and post-choice sessions are displayed separately.", [
        ...(initialRequests ? [
          table("Initial-page network inventory", ["Measurement", "Recorded value"], [["Request events before a choice", String(initialRequests.metric!.value)], ["Distinct request resources", String(initialRequests.totalResources)], ["Identified services in initial-page inventory", scalar(initialRequests.metric!.overview?.identifiedServices)], ["Distinct request hosts", scalar(initialRequests.distinctHosts)]]),
          table("Initial-page request resources", ["Method / resource", "Vendor / classification", "Events"], initialRequests.rows.map(row => [`${row.method ?? "Not retained"} ${row.resource}`, `${row.vendor ?? "Unidentified"}; ${row.classification}`, String(row.eventCount)]), { mono: [0], widths: [.56, .30, .14], compact: true }),
          ...(initialRequests.omittedResources ? [text(`${initialRequests.omittedResources} additional resource rows are available in the online inventory.`, true)] : []),
        ] : []),
        table("F.1 Before a choice", ["Service", "Purpose", "Observed host"], preServiceRows.map(r => [r.vendor, r.purpose.join(", "), r.domains.join(", ")]), { widths: [.25, .35, .40] }),
        table("F.2 Hosts across choice samples", ["Host", "Recorded vendor", "After Accept", "After Reject"], domains.map(host => { const rows = allRequests.filter(r => r.hostname === host); const state = (a: "accept" | "reject") => { const s = rows.filter(r => r.action === a); return !s.length ? "Not observed in sample" : s.some(r => r.nonEssential) ? "Seen; non-essential recorded" : "Seen; other activity recorded"; }; return [host, unique(rows.map(requestName)).join(", "), state("accept"), state("reject")]; }), { mono: [0], widths: [.31, .23, .23, .23], compact: true }),
        ...(conflicts.length ? [text(`For ${conflicts.join(", ")}, a matching sanitized path has different recorded classifications between sessions. Both observations are preserved; this view does not change canonical classification.`, true)] : []),
    ]);
    const axe = report.accessibilityEvidence, axeSummary = report.accessibilityAudit;
    const followUp=axeSummary?accessibilityReportFollowUp(axeSummary):null;
    const accessibilityStatus:PdfV2Status=followUp?.kind==="review"?"Needs review":followUp?.kind==="manual"?"Manual review":followUp?.kind==="limited"?"Partial":axe?"Observed":"Not tested";
    const rules = [...(axe?.violations ?? []).map(r => ({ ...r, result: "Automated failure" })), ...(axe?.reviewItems ?? []).map(r => ({ ...r, result: "Manual review" }))];
    section("accessibility", "G · Accessibility", accessibilityStatus, axe ? `${axe.rulesEvaluated.length} automated rules evaluated; ${axeSummary?.failedRuleCount ?? "unknown"} failed rules and ${axeSummary?.reviewRuleCount ?? "unknown"} rules requiring review.` : "No structured accessibility result is recorded.", "Automated rules only; incomplete checks and sampled examples are not a WCAG conformance audit.", [
        table("G.1 Results", ["Rule", "WCAG tags", "Impact", "Elements", "Result"], rules.map(r => [r.help, r.tags.filter(t => t.startsWith("wcag")).join(", "), pdfV2Words(r.impact), String(r.nodeCount), r.result]), { widths: [.37, .20, .12, .10, .21] }),
        ...rules.map((r, i) => table(`G.${i + 2} ${r.help} — recorded examples`, ["Selector", "Recorded example / measurement"], r.representativeNodes.map(n => [n.selectors.join("; "), pdfV2Words((r.result === "Manual review" ? n.failureSummary?.replace(/^Fix (?:any|all) of the following:\s*/i, "") : n.failureSummary) || n.htmlSnippet)]), { mono: [0], widths: [.38, .62] })),
        ...(axe?.reviewItems.some(r => r.ruleId === "color-contrast") ? [text("Contrast could not be measured for these examples; they require a manual check.", true)] : []),
    ]);
    const links = base ? { online: `${base}/app/scans/${encodeURIComponent(report.scan.id)}?reviewFocus=${report.reviewFocus}`, workpaper: `${base}/api/scans/${encodeURIComponent(report.scan.id)}/report-export?format=json&reviewFocus=${report.reviewFocus}`, retest: `${base}/?url=${encodeURIComponent(pdfTestedUrl(report) ?? "")}` } : { online: null, workpaper: null, retest: null };
    const model = { version: "certscore.report-pdf-preview.v2", presentation: {statusLabels: REPORT_STATUS_LABELS, followUp: REPORT_FOLLOW_UP}, scanId: report.scan.id, domain: report.scan.domainHostname ?? "Website report", url: pdfTestedUrl(report) ?? "Not recorded", finalUrl: forms.pageUrl ?? report.consentControlAssessment?.document?.canonicalDocumentId ?? "Not recorded",
        brandName: options.brandName?.trim() || "CertScore.ai", footerDisclaimer: REPORT_EXPORT_DISCLAIMER, framework: report.reviewFocusLabel, score: report.score.value, rating: getGdprEprivacyPostureTone(report.score.value).ratingLabel,
        location: pdfRegionLabel(report.scan.scanFrom), date: date(report.scan.completedAt, tz, true), utc: date(report.scan.completedAt, "UTC", true), timeZone: tz, scope: report.reviewScope,
        metrics: [metric("Top issues", priorities.length, `${findings.length} report findings retained`), metric("Before a choice", preNonEssential ?? "Unknown", "classified non-essential cookies/storage; requests counted separately"), metric("After Reject", reject?.nonEssentialRequestCount ?? "Unknown", reject ? unique(reject.requests.filter(r => r.nonEssential).map(requestName)).map(v => `${v} ×${reject.requests.filter(r => r.nonEssential && requestName(r) === v).length}`).join(" · ") || "classified non-essential request events" : "No recorded request window"), metric("Disclosure text observed", `${policyRows.filter(r => r.status === "Observed").length}/${policyRows.length}`, "text presence; adequacy is a separate assessment")],
        findings: findings.map(({ packet, ...f }) => ({ ...f, issueTarget: allIssues.find(i => i.findingIds.includes(f.id))!.id })), issues, otherIssues, priorities: priorities.map(f => ({id:f.id,title:f.title,status:f.status})), highlights: priorityReview.highlights, sections, links,
        topics: [{ title: "CMP and consent", status: consentStatus, target: "consent", summary: consentSummary }, { title: "Privacy policy", status: policyStatus, target: "policy", summary: `${policyRows.filter(r => r.status === "Observed").length}/${policyRows.length} disclosure rows with text; presence is not adequacy.` }, { title: "Cookies and storage", status: storageStatus, target: "storage", summary: inventory.presentationStatus === "insufficient_evidence" ? "Inventory unavailable." : `${preCookies.length} inventory rows before a choice; post-choice evidence is separate.` }, { title: "External services", status: externalStatus, target: "external", summary: initialRequests ? `${initialRequests.metric!.value} requests before a choice; ${domains.length} distinct hosts across choice-session samples.` : `${domains.length} distinct request hosts across choice-session samples.` }, { title: "Transport security", status: !security.length ? "Not tested" : security.some(d => pdfV2Status(d.status) !== "Observed") ? "Partial" : "Observed", target: "forms-security", summary: `${security.length} saved assessments; not a full server-security audit.` }, { title: "Accessibility", status: accessibilityStatus, target: "accessibility", summary: axe ? `${axe.rulesEvaluated.length} evaluated rules; ${axeSummary?.failedRuleCount ?? "unknown"} failed and ${axeSummary?.reviewRuleCount ?? "unknown"} review rules.` : "No structured result recorded." }, { title: "Forms", status: formInventory.totalForms ? "Observed" : formInventory.limited ? "Partial" : forms.assessmentStatus === "not_observed" ? "Not observed" : "Partial", target: "forms-security", summary: `${formInventory.totalForms} form observations${formInventory.afterAcceptForms ? `; ${formInventory.afterAcceptForms} after Accept` : ""}.${formInventory.limited ? " Limited coverage." : ""} No data entry or submission.` }].map(v => ({ ...v, status: v.status as PdfV2Status })),
        retest: issues.some(i => i.tier !== "For information") ? { issues: issues.filter(i => i.tier !== "For information").map(i => ({ title: i.title, do: i.steps[0] ?? "Review the source evidence.", expected: i.expected })), windows: windows.map(w => ({ choice: w.action, windowMs: w.windowMs })), location: pdfRegionLabel(report.scan.scanFrom) } : null,
        methodology: ["This is an automated technical risk-signal report, not a certification or determination of legal compliance.", "This report describes the recorded starting-page visit and its bounded choice sessions.", "Click completion, choice registration, request presence, storage presence and collection purpose are distinct evidence concepts.", "A request or cookie not observed during a bounded window may appear later, elsewhere or in a different state.", "Changing review focus reuses this visit's evidence; it does not run a new scan.", "Scores and findings come from the recorded assessment."],
        diagnostics, trace: { priorityFindingIds: priorities.map(f => f.id), findingIds: findings.map(f => f.id), reportVersion: report.artifactVersion, assessmentSource: report.consentControlAssessment?.provenance ?? null } };
    const publicValues: string[] = [];
    const collect = (v: unknown) => { if (typeof v === "string")
        publicValues.push(v);
    else if (Array.isArray(v))
        v.forEach(collect);
    else if (v && typeof v === "object")
        Object.entries(v).filter(([k]) => !["id", "findingIds", "findingNumbers", "issueTarget", "target", "evidenceTarget", "trace", "diagnostics"].includes(k)).forEach(([, value]) => collect(value)); };
    collect({ ...model, trace: undefined, diagnostics: undefined });
    assertPublicReportPdfContent(publicValues);
    if (JSON.stringify(report) !== before)
        throw new Error("PDF projection mutated its source report.");
    return model;
}
export type ReportPdfV2Model = ReturnType<typeof buildReportPdfV2Model>;
