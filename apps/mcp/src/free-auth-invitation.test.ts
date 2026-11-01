import assert from "node:assert/strict";
import test from "node:test";
import shared from "@website-signal-risk-scanner/shared";
import { declaredInvitationConversation, McpConversationInvitations } from "./free-auth-invitation.js";

const context = (name: string) => declaredInvitationConversation({ "openai-conversation-id": name }, "local-test-secret")!;
const created = (n: number) => ({ executionMode: "new_scan", reused: false, scanId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` });

test("a conversation reaches the second-new-scan invitation across transport sessions without using IPs", () => {
  const invitations = new McpConversationInvitations();
  const one = context("private-conversation"), same = context("private-conversation");
  assert.equal(one, same);
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.ok(!one.includes("private-conversation"));
  assert.equal(invitations.offer(one, created(1), 1), null);
  assert.equal(invitations.offer(same, created(2), 2), shared.MCP_FREE_AUTHENTICATION_INTRO_MESSAGE);
  assert.equal(invitations.offer(context("different-conversation"), created(3), 3), null);
  assert.equal(declaredInvitationConversation({ "x-forwarded-for": "198.51.100.1", "user-agent": "same-client" }, "secret"), null);
});

test("reused, unknown, failed reservations and duplicate scan IDs do not advance invitation milestones", () => {
  const invitations = new McpConversationInvitations(), key = context("one");
  for (const result of [{ ...created(1), reused: true }, { ...created(1), executionMode: "reused_scan" }, { scanId: created(1).scanId }, { executionMode: "new_scan" }, { ...created(1), scanId: "placeholder" }]) {
    assert.equal(invitations.offer(key, result, 1), null);
  }
  assert.equal(invitations.size, 0);
  assert.equal(invitations.offer(key, created(1), 1), null);
  assert.equal(invitations.offer(key, created(1), 2), null);
  assert.equal(invitations.offer(key, created(2), 3), shared.MCP_FREE_AUTHENTICATION_INTRO_MESSAGE);
  assert.equal(invitations.offer(key, created(2), 4), null, "a retry must not repeat an offer");
  assert.equal(invitations.rememberedIds, 2);
});

test("invitations are occasional, saturate at the last milestone and reset at the UTC day boundary", () => {
  const invitations = new McpConversationInvitations(), key = context("one");
  for (let n = 1; n <= 80; n++) {
    const offer = invitations.offer(key, created(n), 1000 + n);
    assert.equal(offer, n === 2 ? shared.MCP_FREE_AUTHENTICATION_INTRO_MESSAGE
      : [5, 10, 25, 50].includes(n) ? shared.MCP_FREE_AUTHENTICATION_MESSAGE : null);
  }
  assert.equal(invitations.rememberedIds, 50);
  assert.equal(invitations.offer(key, created(81), 86_400_001), null);
  assert.equal(invitations.offer(key, created(82), 86_400_002), shared.MCP_FREE_AUTHENTICATION_INTRO_MESSAGE);
  assert.equal(invitations.rememberedIds, 2);
});

test("client declarations are bounded and cannot create invitation state from IPs or invalid values", () => {
  for (const value of [undefined, [], ["two", "values"], "", " ", "x".repeat(257), "private\nvalue", "a b"]) {
    assert.equal(declaredInvitationConversation({ "openai-conversation-id": value }, "secret"), null);
  }
  const invitations = new McpConversationInvitations();
  assert.equal(invitations.offer("unhashed-client-value", created(1), 1), null);
  assert.equal(invitations.size, 0);
  for (let n = 1; n <= shared.MCP_FREE_AUTHENTICATION.maxConversationContexts + 1; n++) invitations.offer(context(String(n)), created(n), 1);
  assert.equal(invitations.size, shared.MCP_FREE_AUTHENTICATION.maxConversationContexts);
  const many = new McpConversationInvitations();
  for (let group = 0; group < 250; group++) for (let n = 1; n <= 50; n++) many.offer(context(String(group)), created(group * 50 + n), 1);
  assert.ok(many.rememberedIds <= shared.MCP_FREE_AUTHENTICATION.maxRememberedConversationScanIds);
});
