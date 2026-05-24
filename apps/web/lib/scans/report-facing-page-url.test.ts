import assert from "node:assert/strict";
import test from "node:test";
import {
  getReportFacingScannedPageUrl,
  getReportFacingScannedPageUrls,
  isRuntimeRequestEvidenceUrl,
  stripReportUrlAnnotation
} from "./report-facing-page-url";

test("report-facing scanned page URL helpers strip redaction annotations", () => {
  assert.equal(
    stripReportUrlAnnotation("https://dpm.demdex.net/id [query_redacted=true query_keys=d_orgid,ts]"),
    "https://dpm.demdex.net/id"
  );
});

test("report-facing scanned page URL helpers reject runtime request evidence URLs", () => {
  assert.equal(
    isRuntimeRequestEvidenceUrl("https://cms.quantserve.com/pixel/p-vj4AYjBqd6VJ2.gif [query_redacted=true query_keys=idmatch,gdpr]"),
    true
  );
  assert.equal(isRuntimeRequestEvidenceUrl("https://maps.googleapis.com/maps/api/js [query_redacted=true query_keys=key,callback]"), true);
  assert.equal(isRuntimeRequestEvidenceUrl("https://www.fandango.com/"), false);
});

test("report-facing scanned page URL helpers prefer human page URLs over request URLs", () => {
  const finding = {
    evidence: {
      pageUrls: [
        "https://www.fandango.com/",
        "https://cms.quantserve.com/pixel/p-vj4AYjBqd6VJ2.gif [query_redacted=true query_keys=idmatch,gdpr,gdpr_consent]"
      ],
      sourceUrls: ["https://dpm.demdex.net/id [query_redacted=true query_keys=d_orgid,ts]"]
    },
    primaryPageUrl: "https://cms.quantserve.com/pixel/p-vj4AYjBqd6VJ2.gif [query_redacted=true query_keys=idmatch,gdpr,gdpr_consent]"
  };

  assert.equal(getReportFacingScannedPageUrl(finding), "https://www.fandango.com/");
  assert.deepEqual(getReportFacingScannedPageUrls(finding), ["https://www.fandango.com/"]);
});
