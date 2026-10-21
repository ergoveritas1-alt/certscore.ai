import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicReportPdfContent, publicReportPdfBaseUrl, UnsafeReportPdfContentError } from "./report-pdf-public-safety";

test("public PDFs fail closed for internal hosts, storage pointers and local artifact prefixes", () => {
  for (const text of ["http://localhost:3000/api/scans/id", "LOCALHOST", "s3://private-bucket/object", "v2-dag-lambda/local-parity/scan",
    "http://10.1.2.3/", "192.168.1.2", "172.16.0.1", "http://127.0.0.2/", "http://169.254.169.254/", "http://[::1]/", "http://[fd12::4]/", "100.64.1.2", "http://[::ffff:127.0.0.1]/", "http://[0:0:0:0:0:0:0:1]/", "http://2130706433/"]) {
    assert.throws(() => assertPublicReportPdfContent([text]), UnsafeReportPdfContentError, text);
  }
  assert.doesNotThrow(() => assertPublicReportPdfContent(["https://certscore.ai/scan/id", "1.01 s after scan start", "4.11.3", "https://www.clarity.ms/collect"]));
  assert.equal(publicReportPdfBaseUrl("http://localhost:3000"), null);
  assert.equal(publicReportPdfBaseUrl("https://certscore.ai/path"), "https://certscore.ai");
  assert.equal(publicReportPdfBaseUrl("file:///private/report"), null);
});
