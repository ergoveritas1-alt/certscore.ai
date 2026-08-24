import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = "/Users/benmasek/Downloads/answer (1).csv";
const outputDir = "/Users/benmasek/WC01/outputs/microsoft-attestation-corrected-20260823";
const csvOutputPath = `${outputDir}/CertScore-Microsoft-Attestation-Corrected.csv`;
const xlsxOutputPath = `${outputDir}/CertScore-Microsoft-Attestation-Corrected.xlsx`;

const answers = new Map([
  [2, "CertScore.ai Website Privacy Scanner MCP for Microsoft"],
  [3, "https://certscore.ai"],
  [4, "https://certscore.ai/terms"],
  [5, "Scans public websites for observable accessibility, privacy, cookie, tracker, consent, policy, disclosure, and HTTPS/TLS risk signals. Results are evidence-led review aids, not legal advice, certification, or compliance determinations."],
  [6, "True"],
  [7, "United States"],
  [8, "True"],
  [9, "https://certscore.ai/developers/mcp"],
  [10, "PaaS/Serverless"],
  [11, "Amazon Web Services (AWS), Azure"],
  [12, "support@certscore.ai"],
  [13, "privacy@certscore.ai"],
  [15, "True"],
  [16, "Submitted public website URLs and scan settings; account and organization identifiers; Entra tenant/client identifiers; operational logs; scan metadata; derived findings; and bounded public-web evidence excerpts or pointers. No Microsoft Graph mail, files, chats, or directory data are accessed."],
  [17, "True"],
  [18, "True"],
  [19, "Account and organization identifiers, submitted URLs, scan settings and status, report and finding metadata, billing references, API activity, privacy-request metadata, and bounded evidence pointers or excerpts. Payment-card details and Microsoft Graph content are not stored."],
  [20, "United States"],
  [21, "True"],
  [22, "More than 90 days"],
  [23, "True"],
  [24, "True"],
  [25, "False"],
  [27, "False"],
  [28, "True"],
  [29, "Application Controls"],
  [30, "True"],
  [31, "True"],
  [32, "True"],
  [33, "False"],
  [34, "True"],
  [35, "True"],
  [36, "True"],
  [37, "False"],
  [38, "False"],
  [39, "None of the above"],
  [40, "False"],
  [41, "False"],
  [42, "True"],
  [43, "True"],
  [44, "True"],
  [45, "False"],
  [46, "False"],
  [47, "False"],
  [49, "NA"],
  [50, "NA"],
  [51, "NA"],
  [53, "False"],
  [56, "False"],
  [58, "NA"],
  [59, "False"],
  [61, "NA"],
  [63, "NA"],
  [65, "NA"],
  [67, "False"],
  [69, "NA"],
  [70, "NA"],
  [71, "NA"],
  [72, "NA"],
  [73, "False"],
  [76, "True"],
  [77, "True"],
  [78, "https://certscore.ai/privacy"],
  [79, "False"],
  [81, "False"],
  [82, "False"],
  [83, "False"],
  [85, "True"],
  [86, "True"],
  [87, "True"],
  [88, "False"],
  [90, "True"],
  [91, "True"],
  [93, "29eaafce-c468-4f71-8408-8cbdc1bb535b"],
  [94, "3fecc197-3e2f-415e-9a36-9fbed37cce61"],
  [95, "False"],
  [96, "False"],
  [101, "True"],
  [102, "False"],
  [103, "NA"],
  [104, "jose v6.2.2 for RS256 JWT signature and Microsoft Entra access-token claims validation. The AWS app validates inbound tokens and does not acquire tokens itself."],
  [105, "True"],
  [106, "Microsoft Entra Conditional Access for workload identities (service principals), including location-based and service-principal risk-based policies enforced at app-only token issuance. Interactive-user MFA, device-compliance, and session policies are not applicable."],
  [107, "NA"],
  [108, "False"],
  [109, "True"],
  [111, "Microsoft Entra ID OAuth 2.0 and Azure Key Vault"],
  [112, "Microsoft Entra ID issues app-only access tokens for the protected MCP endpoint. Azure Key Vault stores the confidential-client credential required by Microsoft Agent Connector certification/runtime. The app does not access Microsoft Graph customer content."],
]);

const csvText = await fs.readFile(inputPath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Answers" });
const sheet = workbook.worksheets.getItem("Answers");
const matrix = sheet.getRange("A1:C113").values;

for (let index = 1; index < matrix.length; index += 1) {
  if (["True/False", "True/False/NA"].includes(String(matrix[index][2] ?? ""))) {
    matrix[index][2] = "";
  }
}

for (const [rowNumber, answer] of answers) {
  matrix[rowNumber - 1][2] = answer;
}
sheet.getRange("A1:C113").values = matrix;

sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);
sheet.getRange("A1:C1").format = {
  fill: "#0F172A",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 28,
};
sheet.getRange("A2:C113").format = {
  font: { color: "#172033", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: "#E2E8F0" } },
};
sheet.getRange("A1:A113").format.columnWidth = 58;
sheet.getRange("B1:B113").format.columnWidth = 68;
sheet.getRange("C1:C113").format.columnWidth = 52;
sheet.getRange("A2:C113").format.rowHeight = 56;
sheet.getRange("C2:C113").format.fill = "#F8FAFC";

const notes = workbook.worksheets.add("Review Notes");
notes.showGridLines = false;
notes.freezePanes.freezeRows(1);
notes.getRange("A1:D1").values = [["Question / topic", "Submitted answer", "Reason", "Evidence or required action"]];
notes.getRange("A2:D10").values = [
  ["MFA coverage", "None of the above", "Repository evidence cannot prove MFA is enabled for GitHub, DNS, and key stores.", "Owner should replace with the actual enabled categories only after checking the live GitHub, DNS, AWS, and Azure accounts."],
  ["Data-sharing agreements", "False", "The privacy assessment lists signed processor agreements and DPAs as missing operational evidence.", "Sign and retain processor agreements before changing to True."],
  ["Independent production review", "False", "The documented control says the answer remains No until a second reviewer and branch protections are verified.", "/Users/benmasek/WC01/docs/security-operations.md"],
  ["Privacy/security reviews", "False", "The completed assessment is an unsigned draft and explicitly says the answer remains No until owner adoption.", "/Users/benmasek/WC01/outputs/privacy-governance/CertScore-Privacy-Risk-Assessment-2026.pdf"],
  ["Microsoft identity checklist", "False", "No retained line-by-line attestation establishes completion of every applicable checklist item.", "https://learn.microsoft.com/en-us/entra/identity-platform/identity-platform-integration-checklist"],
  ["MSAL / Microsoft Identity Web", "NA", "The AWS resource API validates inbound tokens and does not acquire them.", "/Users/benmasek/WC01/apps/mcp/src/microsoft-entra-auth.ts"],
  ["Conditional Access", "True", "The single-tenant client-credentials topology supports Conditional Access for workload identities at token issuance.", "https://learn.microsoft.com/en-us/entra/identity/conditional-access/workload-identity"],
  ["Continuous Access Evaluation", "NA", "Workload-identity CAE currently applies to Microsoft Graph; this connector protects a custom resource API.", "https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation-workload"],
  ["Azure app IDs", "Primary resource API ID supplied", "The questionnaire should also list the confidential client app if the portal permits another app-ID block.", "Additional client app ID: 87f30881-d870-422a-96f2-95a7c7d38f50; same tenant; Graph permissions: False; multiuse: False."],
];
notes.getRange("A1:D1").format = {
  fill: "#0F172A",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 28,
};
notes.getRange("A2:D10").format = {
  verticalAlignment: "top",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: "#E2E8F0" } },
  rowHeight: 62,
};
notes.getRange("A1:A10").format.columnWidth = 28;
notes.getRange("B1:B10").format.columnWidth = 20;
notes.getRange("C1:C10").format.columnWidth = 58;
notes.getRange("D1:D10").format.columnWidth = 72;

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const correctedCsv = matrix.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
await fs.writeFile(csvOutputPath, correctedCsv, "utf8");

const answerPreview = await workbook.render({
  sheetName: "Answers",
  range: "A1:C113",
  scale: 0.55,
  format: "png",
});
await fs.writeFile(`${outputDir}/answers-preview.png`, new Uint8Array(await answerPreview.arrayBuffer()));

const notesPreview = await workbook.render({
  sheetName: "Review Notes",
  range: "A1:D10",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outputDir}/notes-preview.png`, new Uint8Array(await notesPreview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(xlsxOutputPath);

const answerCheck = await workbook.inspect({
  kind: "table",
  range: "Answers!A90:C113",
  include: "values,formulas",
  tableMaxRows: 24,
  tableMaxCols: 3,
  maxChars: 10000,
});
const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(answerCheck.ndjson);
console.log(errorCheck.ndjson);
console.log(JSON.stringify({ csvOutputPath, xlsxOutputPath, answered: answers.size }));
