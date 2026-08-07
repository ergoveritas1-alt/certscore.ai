import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const latest = await certscore.domains.latest("ergoveritas.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("ergoveritas.com");

console.log(status.status, findings.findings.length, preConsentTable.summary.rowCount, latest.scan?.scanId, latestPreConsentTable.summary.rowCount);
