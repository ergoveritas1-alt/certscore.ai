import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAdminRequestProvenance } from "./request-provenance";

describe("classifyAdminRequestProvenance", () => {
  it("labels corpus imports as internal imports", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        organizationName: "CertScore Corpus Import",
        requesterIp: null
      }).kind,
      "internal_import"
    );
  });

  it("labels validation ops workspace scans separately", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        organizationName: "Validation Ops Internal",
        requesterIp: null
      }).kind,
      "validation_ops"
    );
  });

  it("labels GPT action requests before anonymous public requests", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        organizationName: "Public / anonymous",
        requestChannel: "gpt_action",
        requestedByAnonymous: true
      }).kind,
      "gpt_action"
    );
  });

  it("labels MCP requests before anonymous public requests", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        requestChannel: "mcp",
        requestedByAnonymous: true
      }).kind,
      "mcp"
    );
  });

  it("labels signed-in workspace scans as authenticated user activity", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        organizationName: "Acme Corp",
        requesterIp: "203.0.113.5"
      }).kind,
      "authenticated_user"
    );
  });

  it("labels anonymous marketing scan sources as public traffic", () => {
    assert.equal(
      classifyAdminRequestProvenance({
        source: "marketing-anonymous-full-scan"
      }).kind,
      "anonymous_public"
    );
  });
});
