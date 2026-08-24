import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.dirname(new URL(import.meta.url).pathname);
const outputDir = path.join(root, "outputs");
const previewDir = path.join(root, "previews");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const wb = Workbook.create();
const summary = wb.worksheets.add("Start Here");
const risks = wb.worksheets.add("Risk Register");
const privacy = wb.worksheets.add("Privacy Screening");
const incidents = wb.worksheets.add("Incident Log");
const breaches = wb.worksheets.add("Breach Decisions");
const schedule = wb.worksheets.add("Review Schedule");
const evidence = wb.worksheets.add("Evidence Index");

const NAVY = "#17324D";
const BLUE = "#24527A";
const PALE_BLUE = "#E8EEF5";
const PALE_GRAY = "#F2F4F7";
const MID = "#667085";
const WHITE = "#FFFFFF";
const RED = "#FDECEC";
const AMBER = "#FFF4CE";
const GREEN = "#EAF5EE";
const BORDER = "#D0D5DD";

function title(sheet, titleText, subtitle, endCol) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${endCol}1`).merge();
  sheet.getRange("A1").values = [[titleText]];
  sheet.getRange(`A1:${endCol}1`).format = {
    fill: NAVY,
    font: { bold: true, color: WHITE, size: 18 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${endCol}1`).format.rowHeight = 34;
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${endCol}2`).format = {
    fill: PALE_BLUE,
    font: { color: NAVY, italic: true, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${endCol}2`).format.rowHeight = 31;
}

function header(sheet, range) {
  sheet.getRange(range).format = {
    fill: BLUE,
    font: { bold: true, color: WHITE, size: 9 },
    wrapText: true,
    verticalAlignment: "center",
    borders: { preset: "all", style: "thin", color: BORDER },
  };
}

function body(sheet, range) {
  sheet.getRange(range).format = {
    font: { color: "#202124", size: 9 },
    wrapText: true,
    verticalAlignment: "top",
    borders: {
      insideHorizontal: { style: "thin", color: BORDER },
      bottom: { style: "thin", color: BORDER },
    },
  };
}

function setWidths(sheet, mapping) {
  for (const [range, width] of Object.entries(mapping)) {
    sheet.getRange(range).format.columnWidth = width;
  }
}

title(summary, "CertScore Security & Privacy Operational Registers", "Version 1.0 | Prepared 2026-08-23 | Seeded records require Product Owner validation before the governance pack is represented as operating.", "H");
summary.getRange("A4:H4").merge();
summary.getRange("A4").values = [["Adoption gate"]];
summary.getRange("A4:H4").format = { fill: AMBER, font: { bold: true, color: NAVY, size: 12 }, borders: { preset: "outside", style: "thin", color: BORDER } };
summary.getRange("A5:H7").merge();
summary.getRange("A5").values = [["Do not answer the four diligence questions “Yes” until the companion policies are approved, owners/contacts are named, the seeded registers are validated, and the tabletop exercise is completed. This workbook is an operating record, not a certification."]];
summary.getRange("A5:H7").format = { fill: "#FFF9E8", font: { color: "#202124", size: 11 }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: BORDER } };

summary.getRange("A9:B9").values = [["Measure", "Current workbook result"]];
header(summary, "A9:B9");
summary.getRange("A10:A14").values = [["Seeded risks"], ["Critical/high residual risks"], ["Privacy items requiring review"], ["Overdue scheduled actions"], ["Recorded incidents"]];
summary.getRange("B10").formulas = [["=COUNTA('Risk Register'!$A$6:$A$105)"]];
summary.getRange("B11").formulas = [["=COUNTIF('Risk Register'!$L$6:$L$105,\"Critical\")+COUNTIF('Risk Register'!$L$6:$L$105,\"High\")"]];
summary.getRange("B12").formulas = [["=COUNTIF('Privacy Screening'!$K$6:$K$105,\"Review required\")+COUNTIF('Privacy Screening'!$K$6:$K$105,\"DPIA required\")"]];
summary.getRange("B13").formulas = [["=COUNTIF('Review Schedule'!$H$6:$H$105,\"Overdue\")"]];
summary.getRange("B14").formulas = [["=COUNTA('Incident Log'!$A$6:$A$105)"]];
body(summary, "A10:B14");
summary.getRange("B10:B14").format = { fill: PALE_BLUE, font: { bold: true, color: NAVY, size: 12 }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "all", style: "thin", color: BORDER } };

summary.getRange("D9:H9").merge();
summary.getRange("D9").values = [["First 60 minutes"]];
summary.getRange("D9:H9").format = { fill: BLUE, font: { bold: true, color: WHITE, size: 11 } };
summary.getRange("D10:H15").values = [
  ["1", "Approve", "Sign the three companion policies and enter effective dates.", "Evidence Index", "Required"],
  ["2", "Assign", "Name incident, technical, privacy, and communications contacts.", "Incident procedure", "Required"],
  ["3", "Validate", "Review seeded risks and privacy entries against actual practices.", "Risk / Privacy tabs", "Required"],
  ["4", "Schedule", "Accept or adjust the quarterly and annual review dates.", "Review Schedule", "Required"],
  ["5", "Exercise", "Run the tabletop and record gaps, owners, and due dates.", "Adoption record", "Required"],
  ["6", "Respond", "Only then use the permitted “Yes” questionnaire wording.", "Adoption record", "Required"],
];
body(summary, "D10:H15");
summary.getRange("D10:D15").format = { fill: PALE_BLUE, font: { bold: true, color: NAVY, size: 11 }, horizontalAlignment: "center", borders: { preset: "all", style: "thin", color: BORDER } };
setWidths(summary, { "A:A": 30, "B:B": 20, "C:C": 3, "D:D": 7, "E:E": 13, "F:F": 45, "G:G": 21, "H:H": 12 });
summary.freezePanes.freezeRows(2);

title(risks, "Security Risk Register", "Seeded risk scenarios are a starting point. Validate likelihood, impact, controls, owners, and evidence against the actual environment before approval.", "R");
risks.getRange("A4:R4").merge();
risks.getRange("A4").values = [["Scoring: likelihood (1-5) × impact (1-5). Low 1-4 | Moderate 5-9 | High 10-14 | Critical 15-25."]];
risks.getRange("A4:R4").format = { fill: PALE_GRAY, font: { color: MID, size: 9 }, wrapText: true };
const riskHeaders = [["Risk ID", "Domain", "Risk scenario", "Inherent likelihood", "Inherent impact", "Inherent score", "Inherent rating", "Current controls / evidence to validate", "Residual likelihood", "Residual impact", "Residual score", "Residual rating", "Treatment / next action", "Owner", "Target date", "Status", "Last reviewed", "Evidence reference"]];
risks.getRange("A5:R5").values = riskHeaders;
header(risks, "A5:R5");
risks.getRange("A5:R5").format.rowHeight = 39;
const riskRows = [
  ["R-001", "Identity / AWS", "Compromised privileged AWS or deployment credentials permit unauthorized production access or change.", 3, 5, null, null, "Validate: MFA, least privilege, role separation, short-lived credentials, alerting, and access review.", 2, 5, null, null, "Validate controls; document quarterly privileged-access review and emergency revocation.", "Engineering / Operations", new Date("2026-09-15"), "Open - validate", new Date("2026-08-23"), "[IAM review / alert evidence]"],
  ["R-002", "Software supply chain", "A compromised repository, dependency, CI workflow, or build artifact introduces unauthorized code.", 3, 5, null, null, "Validate: protected branches, review rules, dependency scanning, pinned actions, provenance, and release permissions.", 2, 5, null, null, "Confirm release controls and dependency response workflow; retain screenshots or configuration exports.", "Engineering", new Date("2026-09-30"), "Open - validate", new Date("2026-08-23"), "[repository settings / CI evidence]"],
  ["R-003", "Authentication", "Account takeover or session compromise exposes customer reports, scan data, or administrative functions.", 3, 4, null, null, "Validate: authentication provider controls, session expiry, MFA for privileged roles, rate limits, and audit logs.", 2, 4, null, null, "Review privileged and customer authentication, session revocation, and suspicious-login monitoring.", "Product / Engineering", new Date("2026-09-30"), "Open - validate", new Date("2026-08-23"), "[auth configuration / test]"],
  ["R-004", "Secrets / logging", "Secrets, bearer tokens, sensitive URLs, or personal data are exposed through logs, artifacts, tickets, or source control.", 3, 5, null, null, "Repository guidance prohibits sensitive logging; validate automated secret scanning, redaction, retention, and access restrictions.", 2, 4, null, null, "Test secret detection and log redaction; document emergency rotation and artifact removal procedure.", "Engineering / Operations", new Date("2026-09-15"), "Open - validate", new Date("2026-08-23"), "[test results / logging config]"],
  ["R-005", "Scan evidence", "Retained screenshots, policy text, runtime evidence, or reports contain unexpected personal/confidential data and are disclosed or retained excessively.", 3, 4, null, null, "Validate typed/bounded evidence contracts, restricted storage, retention, access logging, and deletion behavior.", 2, 4, null, null, "Map artifact classes and retention; verify permissions and deletion; minimize unbounded/sensitive content.", "Product Owner", new Date("2026-10-15"), "Open - validate", new Date("2026-08-23"), "[data map / retention evidence]"],
  ["R-006", "Availability", "DDoS, runaway work, capacity failure, or dependency outage makes scanning or reporting unavailable.", 3, 4, null, null, "Validate quotas, bounded scan execution, alarms, retry behavior, degradation, and recovery communications.", 2, 3, null, null, "Document availability objectives and run an outage/recovery exercise without reducing evidence quality.", "Operations", new Date("2026-10-31"), "Open - validate", new Date("2026-08-23"), "[alarms / exercise record]"],
  ["R-007", "Backup / recovery", "Data, configuration, or deployment state cannot be restored accurately after loss or compromise.", 2, 5, null, null, "Validate backup scope, versioned infrastructure/code, restore permissions, retention, and recovery testing.", 2, 4, null, null, "Define recovery sources and complete a documented restore test for critical records and configuration.", "Operations", new Date("2026-10-31"), "Open - validate", new Date("2026-08-23"), "[restore test]"],
  ["R-008", "Third parties", "A processor, model/API provider, identity service, or other critical supplier fails, changes terms/location, or suffers a breach.", 3, 4, null, null, "Validate vendor inventory, contracts, security/privacy review, subprocessors, incident notice, and exit plan.", 2, 4, null, null, "Create/validate critical supplier inventory and record review, notice, transfer, retention, and continuity evidence.", "Product Owner", new Date("2026-10-15"), "Open - validate", new Date("2026-08-23"), "[vendor register / contracts]"],
  ["R-009", "Scanner boundaries", "Scanner inputs or runtime behavior are abused to access unintended resources, exceed authorization, or create harmful traffic.", 3, 5, null, null, "WC01/WS01 responsibility boundary and bounded public-site scanning are documented; validate target restrictions, SSRF defenses, egress, and rate controls.", 2, 4, null, null, "Coordinate with WS01 owner to verify input validation, network boundaries, identity, rate limits, and retained test evidence.", "Product / Scanner Operations", new Date("2026-09-30"), "Open - validate", new Date("2026-08-23"), "[WS01 control evidence]"],
  ["R-010", "Detection / response", "A compromise or data breach is detected late or handled inconsistently because alerting, contacts, or response authority are incomplete.", 3, 5, null, null, "New incident/breach procedure is ready for adoption; actual monitoring and contacts require validation.", 2, 4, null, null, "Approve procedure, name contacts, validate alerts, and complete tabletop exercise.", "Product Owner", new Date("2026-09-05"), "Open - validate", new Date("2026-08-23"), "[signed policy / tabletop]"],
  ["R-011", "Privacy governance", "Personal data is collected, used, shared, transferred, or retained without an accurate inventory, screening, or required DPIA.", 3, 4, null, null, "New privacy/DPIA procedure and seeded screening register are ready for validation.", 2, 4, null, null, "Validate data map and seeded privacy records; complete screenings; schedule quarterly review.", "Product Owner", new Date("2026-09-30"), "Open - validate", new Date("2026-08-23"), "[signed procedure / screenings]"],
  ["R-012", "Business endpoints", "A lost, compromised, or unpatched endpoint exposes credentials, code, customer information, or administrative access.", 3, 4, null, null, "Validate full-disk encryption, patching, screen lock, password manager, endpoint protection, backups, and remote revocation.", 2, 4, null, null, "Document endpoint baseline and verify every privileged endpoint against it.", "Product Owner / Personnel", new Date("2026-10-15"), "Open - validate", new Date("2026-08-23"), "[endpoint checklist]"],
];
risks.getRange(`A6:R${5 + riskRows.length}`).values = riskRows;
for (let row = 6; row <= 5 + riskRows.length; row++) {
  risks.getRange(`F${row}`).formulas = [[`=D${row}*E${row}`]];
  risks.getRange(`G${row}`).formulas = [[`=IF(F${row}>=15,"Critical",IF(F${row}>=10,"High",IF(F${row}>=5,"Moderate","Low")))`]];
  risks.getRange(`K${row}`).formulas = [[`=I${row}*J${row}`]];
  risks.getRange(`L${row}`).formulas = [[`=IF(K${row}>=15,"Critical",IF(K${row}>=10,"High",IF(K${row}>=5,"Moderate","Low")))`]];
}
body(risks, `A6:R${5 + riskRows.length}`);
risks.getRange(`D6:F${5 + riskRows.length}`).format.horizontalAlignment = "center";
risks.getRange(`I6:L${5 + riskRows.length}`).format.horizontalAlignment = "center";
risks.getRange(`O6:Q${5 + riskRows.length}`).format.numberFormat = "yyyy-mm-dd";
risks.getRange(`D6:E105`).dataValidation = { rule: { type: "list", values: [1, 2, 3, 4, 5] } };
risks.getRange(`I6:J105`).dataValidation = { rule: { type: "list", values: [1, 2, 3, 4, 5] } };
risks.getRange("P6:P105").dataValidation = { rule: { type: "list", values: ["Open - validate", "Open", "In progress", "Accepted", "Closed", "Deferred"] } };
risks.getRange("K6:K105").conditionalFormats.add("colorScale", { colors: [GREEN, AMBER, "#F4A3A3"], thresholds: ["min", "50%", "max"] });
risks.tables.add(`A5:R${5 + riskRows.length}`, true, "SecurityRiskRegister").style = "TableStyleMedium2";
setWidths(risks, { "A:A": 10, "B:B": 20, "C:C": 46, "D:E": 11, "F:F": 10, "G:G": 12, "H:H": 52, "I:J": 11, "K:K": 10, "L:L": 12, "M:M": 48, "N:N": 24, "O:O": 13, "P:P": 16, "Q:Q": 13, "R:R": 28 });
risks.freezePanes.freezeRows(5);

title(privacy, "Privacy Screening Register", "Complete a screening before material personal-data changes. Unknown or incomplete evidence must remain Review required; it must not be converted to No.", "N");
const privacyHeaders = [["ID", "Processing activity", "Owner", "Purpose", "Individuals / data categories", "Sources / recipients", "Role & jurisdictions", "Retention / deletion", "DPIA trigger check", "Key privacy risks / actions", "Decision", "Review date", "Approval", "Evidence reference"]];
privacy.getRange("A5:N5").values = privacyHeaders;
header(privacy, "A5:N5");
privacy.getRange("A5:N5").format.rowHeight = 38;
const privacyRows = [
  ["P-001", "Public website scan request, evidence capture, and report generation", "Product Owner", "Analyze authorized public websites and present risk signals/reports.", "Target URL/domain; public-page content and evidence; scan/account/job metadata; incidental names or contact details may appear in public content.", "Customer/requester; target public site; WC01/WS01 systems; approved infrastructure/providers to validate.", "Controller/processor roles and affected jurisdictions require contract/data-flow validation.", "Validate artifact, screenshot, log, report, and deletion periods.", "Unknown pending scale, monitoring, matching, identifiability, and contract review.", "Unexpected personal data in public content; excessive evidence; access; transfer; retention. Validate typed/bounded evidence and deletion.", "Review required", new Date("2026-09-30"), "[Product Owner]", "[data map / architecture / contracts]"],
  ["P-002", "User accounts, authentication, and administrative access", "Product / Engineering", "Provide access, security, account administration, and auditability.", "Account identifiers; contact details; authentication/session identifiers; access and security logs.", "Users; identity/auth provider; application and operational systems.", "Validate controller/processor roles, provider locations, and transfer basis.", "Validate account, session, security-log, and deletion periods.", "Likely no DPIA based on current description; validate automation, scale, vulnerable users, and consequences.", "Account takeover; excessive logs; dormant accounts; inaccurate permissions. Validate MFA, deletion, access review, and notice.", "Review required", new Date("2026-09-30"), "[Product Owner]", "[auth data flow / retention / provider terms]"],
  ["P-003", "Application telemetry, security monitoring, and API activity", "Engineering / Operations", "Operate, secure, debug, rate-limit, and evidence system activity.", "IP/device/request metadata; timestamps; identifiers; diagnostic events; avoid raw URLs/secrets where unnecessary.", "Applications, infrastructure, users; monitoring/logging suppliers to validate.", "Validate role, regions, support access, and transfers.", "Validate hot-log, archive, backup, and deletion periods.", "Unknown pending monitoring scale, linkability, and data-field review.", "Overcollection; sensitive URLs/tokens; employee/user monitoring; broad access; long retention. Apply redaction and bounded fields.", "Review required", new Date("2026-09-15"), "[Privacy / Technical Lead]", "[logging schema / retention / access]"],
  ["P-004", "Support, contact, and security reports", "Product Owner", "Answer requests, resolve issues, receive disclosures, and maintain business communications.", "Names, contact details, organization, message content, attachments, support/security context.", "Customers, prospects, reporters; communication/support providers to validate.", "Validate controller/processor role, provider location, and contract terms.", "Define ticket/message retention and secure deletion; preserve legal/security records only when needed.", "Likely no DPIA based on current description; reassess for sensitive/high-volume workflows.", "Sensitive attachments; misrouting; excessive retention; unauthorized staff access. Define intake warnings and restricted escalation.", "Review required", new Date("2026-10-15"), "[Product Owner]", "[support flow / retention / provider terms]"],
  ["P-005", "Model-assisted internal policy extraction and review", "Product Owner", "Support bounded internal extraction/review of retained public policy evidence under configured model roles.", "Retained public policy text/excerpts; provenance; structured outputs; incidental names/contact details may occur.", "Canonical retained evidence; approved model/API provider if enabled; internal review artifacts.", "Validate processing role, provider region/retention/training terms, and transfers before use.", "Bounded inputs/outputs and cache/artifact retention require validation.", "Unknown pending provider, scale, matching, decision impact, and retained-data review.", "Provider retention/use; prompt leakage; unbounded text; unsupported inference; cost. Enforce schemas, provenance, minimization, and failed/unknown states.", "Review required", new Date("2026-09-30"), "[Product Owner]", "[model config / provider terms / data flow]"],
  ["P-006", "Critical vendors, processors, and integrations", "Product Owner", "Provide infrastructure, identity, communications, monitoring, or other approved services.", "Depends on vendor; record exact categories and data subjects per supplier.", "CertScore and named supplier/subprocessors.", "Record controller/processor role, regions, subprocessors, transfer mechanism, and support access.", "Record contract and technical deletion/backup periods.", "Screen each material supplier and processing purpose; unknown until inventory is complete.", "Unapproved subprocessors; changed purpose/location; breach notice; lock-in; deletion gaps. Maintain vendor review and exit path.", "Review required", new Date("2026-10-15"), "[Product Owner]", "[vendor register / DPA / security review]"],
];
privacy.getRange(`A6:N${5 + privacyRows.length}`).values = privacyRows;
body(privacy, `A6:N${5 + privacyRows.length}`);
privacy.getRange(`L6:L${5 + privacyRows.length}`).format.numberFormat = "yyyy-mm-dd";
privacy.getRange("K6:K105").dataValidation = { rule: { type: "list", values: ["No DPIA presently required", "DPIA required", "Review required", "Closed / superseded"] } };
privacy.getRange("K6:K105").conditionalFormats.addCustom('=$K6="DPIA required"', { fill: RED, font: { bold: true, color: "#9B1C1C" } });
privacy.getRange("K6:K105").conditionalFormats.addCustom('=$K6="Review required"', { fill: AMBER, font: { bold: true, color: "#7A5A00" } });
privacy.tables.add(`A5:N${5 + privacyRows.length}`, true, "PrivacyScreeningRegister").style = "TableStyleMedium2";
setWidths(privacy, { "A:A": 9, "B:B": 34, "C:C": 22, "D:D": 38, "E:E": 50, "F:F": 42, "G:G": 38, "H:H": 36, "I:I": 46, "J:J": 52, "K:K": 20, "L:L": 13, "M:M": 18, "N:N": 32 });
privacy.freezePanes.freezeRows(5);

title(incidents, "Security Incident Log", "Create one row for every reported event. Use a restricted evidence reference instead of copying secrets or unnecessary personal data into this log.", "N");
const incidentHeaders = [["Incident ID", "Reported UTC", "Reporter", "Summary", "Severity", "Incident Lead", "Systems / data", "Containment", "Status", "Recovery UTC", "Lessons review", "Risk updates", "Evidence reference", "Closure approval"]];
incidents.getRange("A5:N5").values = incidentHeaders;
header(incidents, "A5:N5");
incidents.getRange("A6:N10").values = Array.from({ length: 5 }, () => Array(14).fill(null));
body(incidents, "A6:N10");
incidents.getRange("B6:B105").format.numberFormat = "yyyy-mm-dd hh:mm";
incidents.getRange("J6:J105").format.numberFormat = "yyyy-mm-dd hh:mm";
incidents.getRange("K6:K105").format.numberFormat = "yyyy-mm-dd";
incidents.getRange("E6:E105").dataValidation = { rule: { type: "list", values: ["SEV-1 Critical", "SEV-2 High", "SEV-3 Moderate", "SEV-4 Low"] } };
incidents.getRange("I6:I105").dataValidation = { rule: { type: "list", values: ["Open", "Contained", "Monitoring", "Recovered", "Closed"] } };
setWidths(incidents, { "A:A": 13, "B:B": 19, "C:C": 20, "D:D": 44, "E:E": 18, "F:F": 21, "G:H": 42, "I:I": 14, "J:J": 19, "K:K": 15, "L:L": 30, "M:M": 32, "N:N": 24 });
incidents.freezePanes.freezeRows(5);

title(breaches, "Personal Data Breach Decision Log", "Record every personal-data breach and the notification decision. The 72-hour deadline applies only when the applicable legal threshold is met; processor notices may have different timing.", "Q");
const breachHeaders = [["Breach ID", "Incident ID", "Awareness UTC", "Controller / processor", "Jurisdictions / authority", "Data and individuals", "Risk to individuals", "Authority decision", "Authority deadline", "Submitted UTC", "Individuals decision", "Controller / contract notice", "Decision approver", "Rationale", "Follow-up", "Status", "Evidence reference"]];
breaches.getRange("A5:Q5").values = breachHeaders;
header(breaches, "A5:Q5");
breaches.getRange("A6:Q10").values = Array.from({ length: 5 }, () => Array(17).fill(null));
for (let row = 6; row <= 105; row++) {
  breaches.getRange(`I${row}`).formulas = [[`=IF(C${row}="","",C${row}+3)`]];
}
body(breaches, "A6:Q10");
breaches.getRange("C6:C105").format.numberFormat = "yyyy-mm-dd hh:mm";
breaches.getRange("I6:J105").format.numberFormat = "yyyy-mm-dd hh:mm";
breaches.getRange("D6:D105").dataValidation = { rule: { type: "list", values: ["Controller", "Processor", "Both", "Unknown - seek advice"] } };
breaches.getRange("H6:H105").dataValidation = { rule: { type: "list", values: ["Notify", "Do not notify", "Seek advice", "Not applicable"] } };
breaches.getRange("K6:K105").dataValidation = { rule: { type: "list", values: ["Notify individuals", "Do not notify", "Seek advice", "Not applicable"] } };
breaches.getRange("P6:P105").dataValidation = { rule: { type: "list", values: ["Open", "Decision recorded", "Notified", "Closed"] } };
setWidths(breaches, { "A:B": 13, "C:C": 19, "D:D": 20, "E:E": 34, "F:F": 46, "G:G": 44, "H:H": 18, "I:J": 19, "K:K": 21, "L:L": 28, "M:M": 19, "N:O": 45, "P:P": 16, "Q:Q": 30 });
breaches.freezePanes.freezeRows(5);

title(schedule, "Governance Review Schedule", "Scheduled evidence keeps the processes operating. Dates may be adjusted at adoption, but quarterly risk/privacy reviews and annual tabletop testing should remain.", "I");
const scheduleHeaders = [["Review ID", "Activity", "Owner", "Frequency", "Due date", "Completed date", "Evidence reference", "Status", "Notes / actions"]];
schedule.getRange("A5:I5").values = scheduleHeaders;
header(schedule, "A5:I5");
const scheduleRows = [
  ["G-001", "Initial policy approval and register validation", "Product Owner", "One-time adoption", new Date("2026-09-05"), null, "[approval record]", null, "Complete before representing processes as operating."],
  ["G-002", "Security and privacy risk review - Q3 2026", "Product Owner", "Quarterly", new Date("2026-09-30"), null, "[meeting record]", null, "Review all open risks, screenings, incidents, vendor changes, and actions."],
  ["G-003", "Incident response and breach tabletop", "Incident Lead", "Annual", new Date("2026-09-30"), null, "[completed exercise record]", null, "Use the scenario in the Adoption and Assurance Record."],
  ["G-004", "Security and privacy risk review - Q4 2026", "Product Owner", "Quarterly", new Date("2026-12-31"), null, "[meeting record]", null, ""],
  ["G-005", "Security and privacy risk review - Q1 2027", "Product Owner", "Quarterly", new Date("2027-03-31"), null, "[meeting record]", null, ""],
  ["G-006", "Security and privacy risk review - Q2 2027", "Product Owner", "Quarterly", new Date("2027-06-30"), null, "[meeting record]", null, ""],
  ["G-007", "Annual policy and process review", "Product Owner", "Annual", new Date("2027-08-23"), null, "[approval / change record]", null, "Review after material change even if annual date has not arrived."],
  ["G-008", "Annual incident response and breach tabletop", "Incident Lead", "Annual", new Date("2027-08-23"), null, "[exercise record]", null, "Run sooner after material personnel/architecture changes."],
];
schedule.getRange(`A6:I${5 + scheduleRows.length}`).values = scheduleRows;
for (let row = 6; row <= 5 + scheduleRows.length; row++) {
  schedule.getRange(`H${row}`).formulas = [[`=IF(F${row}<>"","Complete",IF(E${row}<TODAY(),"Overdue",IF(E${row}-TODAY()<=30,"Due soon","Scheduled")))`]];
}
body(schedule, `A6:I${5 + scheduleRows.length}`);
schedule.getRange(`E6:F${5 + scheduleRows.length}`).format.numberFormat = "yyyy-mm-dd";
schedule.getRange("H6:H105").conditionalFormats.addCustom('=$H6="Overdue"', { fill: RED, font: { bold: true, color: "#9B1C1C" } });
schedule.getRange("H6:H105").conditionalFormats.addCustom('=$H6="Due soon"', { fill: AMBER, font: { bold: true, color: "#7A5A00" } });
schedule.getRange("H6:H105").conditionalFormats.addCustom('=$H6="Complete"', { fill: GREEN, font: { bold: true, color: "#1B5E20" } });
schedule.tables.add(`A5:I${5 + scheduleRows.length}`, true, "GovernanceSchedule").style = "TableStyleMedium2";
setWidths(schedule, { "A:A": 11, "B:B": 42, "C:C": 22, "D:D": 18, "E:F": 14, "G:G": 32, "H:H": 15, "I:I": 52 });
schedule.freezePanes.freezeRows(5);

title(evidence, "Governance Evidence Index", "Link or describe evidence without copying secrets, raw tokens, or unnecessary personal data. Keep sensitive material in a restricted source location.", "G");
const evidenceHeaders = [["Evidence ID", "Artifact / control", "Owner", "Status", "Approval / review date", "Location or reference", "Notes"]];
evidence.getRange("A5:G5").values = evidenceHeaders;
header(evidence, "A5:G5");
const evidenceRows = [
  ["E-001", "Information Security Risk Management Policy v1.0", "Product Owner", "Ready for approval", null, "01_Information_Security_Risk_Management_Policy.docx", "Enter signed approval and effective date."],
  ["E-002", "Incident Response and Breach Notification Procedure v1.0", "Product Owner / Incident Lead", "Ready for approval", null, "02_Incident_Response_and_Breach_Notification_Procedure.docx", "Name operational contacts before approval."],
  ["E-003", "Privacy Risk and DPIA Procedure v1.0", "Product Owner", "Ready for approval", null, "03_Privacy_Risk_and_DPIA_Procedure.docx", "Validate initial privacy screenings."],
  ["E-004", "Governance Adoption and Assurance Record v1.0", "Product Owner", "Open", null, "04_Governance_Adoption_and_Assurance_Record.docx", "Complete approval and tabletop sections."],
  ["E-005", "Initial security risk review", "Product Owner", "Open", null, "Risk Register tab", "Validate scoring, controls, owners, dates, and references."],
  ["E-006", "Initial privacy-risk review", "Product Owner / Privacy reviewer", "Open", null, "Privacy Screening tab", "Validate data flows and decisions; complete any required DPIA."],
  ["E-007", "Initial incident/breach tabletop", "Incident Lead", "Open", null, "Adoption record + supporting notes", "Record participants, decisions, gaps, and actions."],
  ["E-008", "ICO personal data breach guidance", "Reference", "Current reference", new Date("2025-08-20"), "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/", "Check for updates during annual review."],
  ["E-009", "ICO DPIA guidance", "Reference", "Current reference", null, "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/", "Check for updates during annual review."],
  ["E-010", "NIST CSF 2.0 Small Business Quick-Start Guide", "Reference", "Current reference", null, "https://csrc.nist.gov/pubs/sp/1300/final", "Proportionate small-business security framework reference."],
];
evidence.getRange(`A6:G${5 + evidenceRows.length}`).values = evidenceRows;
body(evidence, `A6:G${5 + evidenceRows.length}`);
evidence.getRange(`E6:E${5 + evidenceRows.length}`).format.numberFormat = "yyyy-mm-dd";
evidence.getRange("D6:D105").dataValidation = { rule: { type: "list", values: ["Ready for approval", "Approved", "Open", "Complete", "Superseded", "Current reference"] } };
evidence.tables.add(`A5:G${5 + evidenceRows.length}`, true, "GovernanceEvidenceIndex").style = "TableStyleMedium2";
setWidths(evidence, { "A:A": 12, "B:B": 46, "C:C": 28, "D:D": 20, "E:E": 18, "F:F": 72, "G:G": 48 });
evidence.freezePanes.freezeRows(5);

const inspection = await wb.inspect({ kind: "workbook,sheet,table", maxChars: 6000, tableMaxRows: 4, tableMaxCols: 8 });
console.log(inspection.ndjson);
const formulaErrors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(formulaErrors.ndjson);

for (const sheetName of ["Start Here", "Risk Register", "Privacy Screening", "Incident Log", "Breach Decisions", "Review Schedule", "Evidence Index"]) {
  const preview = await wb.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "_")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(wb);
const outputPath = path.join(outputDir, "05_Security_and_Privacy_Operational_Registers.xlsx");
await output.save(outputPath);
console.log(outputPath);
