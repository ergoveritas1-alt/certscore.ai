import assert from "node:assert/strict";
import test from "node:test";
import { apiAccessibilityAuditSummarySchema, accessibilityAuditEvidenceOpenApiProperties } from "./accessibility-audit.js";
import { apiV2ScanJobSchema, apiV2ScanResourceSchema } from "./api-v2.js";
import { pulseResponseSchema } from "./pulse-v1.js";
import { mcpScanStatusOutputSchema, mcpScanSiteOutputSchema } from "./mcp.js";
import { buildCertScoreApiV2OpenApiDocument } from "./openapi-v2.js";
import { buildPulseV1OpenApiDocument } from "./openapi.js";
import { buildPulseChatGptOpenApiDocument } from "./openapi-chatgpt.js";

const coverage = { version: "breadth_before_detail.v1", observedNodeCount: 503,
  retainedNodeCount: 4, omittedNodeCount: 499, byteBudgetLimited: true };
const summary = { status: "completed", required: true, scope: "starting_page_rendered_content", engine: "axe-core",
  engineVersion: "4.11.3", durationMs: 100, failedRuleCount: 4, affectedNodeCount: 503, reviewRuleCount: 0 };

test("bounded example coverage survives API resource, status, Pulse and MCP validation", () => {
  const accessibilityAudit = { ...summary, exampleCoverage: coverage };
  assert.deepEqual(apiV2ScanResourceSchema.parse({ type: "certscore_scan", scanId: "fixture", domain: "example.test",
    status: "completed", accessibilityAudit }).accessibilityAudit?.exampleCoverage, coverage);
  assert.deepEqual(apiV2ScanJobSchema.parse({ type: "certscore_scan_job", jobId: "fixture", status: "completed",
    accessibilityAudit }).accessibilityAudit?.exampleCoverage, coverage);
  assert.deepEqual(pulseResponseSchema.parse({ type: "certscore_pulse", accessibilityAudit }).accessibilityAudit?.exampleCoverage, coverage);
  for (const schema of [mcpScanStatusOutputSchema, mcpScanSiteOutputSchema]) {
    assert.deepEqual(schema.shape.accessibilityAudit.parse(accessibilityAudit)?.exampleCoverage, coverage);
  }
});

test("historical summaries stay readable and example counts fail closed", () => {
  assert.deepEqual(apiAccessibilityAuditSummarySchema.parse(summary), summary);
  for (const changed of [{ retainedNodeCount: 5 }, { omittedNodeCount: -1 }, { observedNodeCount: 200_000_001 },
    { retainedNodeCount: 1001 }, { version: "unknown" }, { rawHtml: "private" }]) {
    assert.equal(apiAccessibilityAuditSummarySchema.safeParse({ ...summary, exampleCoverage: { ...coverage, ...changed } }).success, false);
  }
  assert.equal(apiAccessibilityAuditSummarySchema.safeParse({ ...summary, inventedField: true }).success, false);
});

test("API v2, Pulse and agent OpenAPI publish the same optional evidence metadata", () => {
  const v2 = buildCertScoreApiV2OpenApiDocument().components.schemas.AccessibilityAudit;
  const pulse = buildPulseV1OpenApiDocument().components.schemas.PulseResponse.properties.accessibilityAudit;
  const agent = buildPulseChatGptOpenApiDocument().components.schemas.PulseResponse.properties.accessibilityAudit;
  for (const schema of [v2, pulse, agent]) {
    assert.deepEqual(schema.properties.exampleCoverage, accessibilityAuditEvidenceOpenApiProperties.exampleCoverage);
    assert.deepEqual(schema.properties.evidenceScope, accessibilityAuditEvidenceOpenApiProperties.evidenceScope);
    assert.equal(schema.additionalProperties, false);
  }
});
