import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const submittedAtMs = Date.now();
const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie",
  metadata: { source: "sdk-example" }
});

const completed = await certscore.scans.wait(created, {
  pollIntervalMs: 5_000,
  onStatusUpdate(status) {
    console.log("scan status", status.scanId ?? created.scanId, status.status, status.phase ?? "");
  }
});
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const latest = await certscore.domains.latest("example.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");
const timings = {
  sdkWallSeconds: Math.round((Date.now() - submittedAtMs) / 100) / 10,
  queuedSeconds: secondsBetween(completed.createdAt, completed.startedAt),
  scannerRuntimeSeconds: secondsBetween(completed.startedAt, completed.completedAt)
};

console.log(status.status, findings.findings.length, preConsentTable.summary.rowCount, latest.scan?.scanId, latestPreConsentTable.summary.rowCount, timings);

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 100) / 10) : null;
}
