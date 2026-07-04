import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const latest = await certscore.domains.latest("example.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");

console.log(status.status, findings.findings.length, preConsentTable.summary.rowCount, latest.scan?.scanId, latestPreConsentTable.summary.rowCount);
