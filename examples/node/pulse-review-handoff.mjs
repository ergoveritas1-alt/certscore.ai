import { CertScoreClient } from "@certscore/sdk";

const targetUrl = process.env.TARGET_URL ?? "https://example.com";
const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create(targetUrl, {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created, {
  maxWaitMs: 300_000,
  onStatusUpdate(status) {
    console.log(`CertScore status: ${status.status}${status.phase ? ` (${status.phase})` : ""}`);
  }
});

const findings = await certscore.findings.list(completed.scanId);
const table = await certscore.scans.preConsentCookiesTrackers(completed.scanId);

console.log({
  scanId: completed.scanId,
  status: completed.status,
  score: completed.score,
  findings: findings.findings.length,
  preConsentRows: table.summary.rowCount,
  report: completed.links?.report
});
