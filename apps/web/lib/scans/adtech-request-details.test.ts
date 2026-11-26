import assert from "node:assert/strict";
import test from "node:test";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { projectAdTechRequestDetails } from "./adtech-request-details";
import { californiaPriorityGpcFixture } from "./test-fixtures/california-priority-gpc";

test("Meta declarations stay attached to the matching GPC request throughout production assessment and report projection", () => {
  const pixel = "https://www.facebook.com/tr/?id=publisher&ev=PageView&fbp=visitor-fixture";
  const assessment = californiaPriorityGpcFixture([pixel, pixel + "&dpo=LDU&dpoco=0&dpost=0"], SHADOW_REPORT.scan.id);
  assert.equal(assessment.contractVersion, "certscore.gpc-response-assessment.v3");
  const report = {...SHADOW_REPORT, gpcResponse: {...SHADOW_REPORT.gpcResponse!, assessment}};
  const rows = projectAdTechRequestDetails(report, "ccpa_cpra").filter(row => row.kind === "meta_pixel");
  assert.deepEqual(rows.map(row => [row.evidenceRef, row.fields]), [
    ["collection-0", ["meta_pixel_identifier"]],
    ["collection-1", ["meta_pixel_identifier", "meta_ldu", "automatic_geography"]],
  ]);
  assert.doesNotMatch(rows[0]!.summary, /Limited Data Use/);
  assert.match(rows[1]!.summary, /Limited Data Use with automatic country and state selection/);
  assert(!JSON.stringify(rows).includes("visitor-fixture"));
  assert(!projectAdTechRequestDetails(report, "gdpr_eprivacy").some(row => row.phase === "gpc_visit"));
  assert.deepEqual(projectAdTechRequestDetails({...report, scan:{...report.scan, id:"different"}}, "ccpa_cpra"), []);
});

test("same-site measurement uses the retained final origin and exposes field names only", () => {
  const urls = [
    "https://metrics.school.example/g/collect?tid=property&cid=private-value&gcs=G100",
    "https://metrics.other.example/g/collect?tid=property&cid=other",
    "https://metrics.school.example/g/collect?tid=property",
  ];
  const row = {...SHADOW_REPORT.preConsentRuntimeRows[0]!, id:"pre_consent_third_party_tracking",
    evidenceJson:{retainedEvidence:{findingEntities:[{id:"preconsent_tracking", entities:{runtimeRequestUrls:urls}}]}}};
  const report = {...SHADOW_REPORT, preConsentRuntimeRows:[row], trackingExternalRows:[],
    scan:{...SHADOW_REPORT.scan, url:"https://original.example", documentOrigin:"https://www.school.example"}};
  const sameSite = projectAdTechRequestDetails(report, "gdpr_eprivacy").filter(item => item.kind === "same_site_measurement");
  assert.equal(sameSite.length, 1);
  assert.equal(sameSite[0]!.endpoint, "https://metrics.school.example/g/collect");
  assert.deepEqual(sameSite[0]!.fields, ["tid","cid","gcs"]);
  assert(!JSON.stringify(sameSite).includes("private-value"));
  assert(!projectAdTechRequestDetails({...report, scan:{...report.scan,documentOrigin:undefined}}, "gdpr_eprivacy").some(r => r.kind === "same_site_measurement"));
});
