import assert from "node:assert/strict";
import test from "node:test";
import { sendScanCompletionEmail } from "./send-completion-email";
import { aggregateFullSite } from "@website-signal-risk-scanner/shared";
import { state } from "../../../../packages/shared/src/full-site-crawl.test";

test("delivery addresses only the persisted account and records SMTP acceptance", async () => {
  const messages: any[] = [],
    outcomes: unknown[][] = [];
  const aggregate = aggregateFullSite({ ...state, status: "completed" }, []);
  const dependencies: any = {
    config: () => ({
      fromEmail: "sender@example.test",
      appUrl: "https://certscore.ai",
      appPassword: "fixture",
    }),
    begin: async () => ({ email: "owner@example.test" }),
    load: async () => ({ summary: aggregate, pages: { rows: [] } }),
    transport: () => ({
      sendMail: async (message: unknown) => {
        messages.push(message);
        return { accepted: ["owner@example.test"] };
      },
      close: () => {},
    }),
    finish: async (...args: unknown[]) => {
      outcomes.push(args);
    },
  };
  await sendScanCompletionEmail(state.scanId, "token", dependencies);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "owner@example.test");
  assert.match(messages[0].text, new RegExp(state.scanId));
  assert.equal(outcomes[0]![2], "sent");
  dependencies.begin = async () => null;
  await sendScanCompletionEmail(state.scanId, "token", dependencies);
  assert.equal(
    messages.length,
    1,
    "Duplicate or unauthorized claims never reach SMTP",
  );
});

test("pre-delivery failures can retry; ambiguous DATA failures cannot duplicate mail", async () => {
  for (const [command, expected] of [
    ["CONN", "retry"],
    ["DATA", "uncertain"],
  ]) {
    const outcomes: unknown[][] = [];
    await sendScanCompletionEmail(state.scanId, "token", {
      config: () => ({
        fromEmail: "sender@example.test",
        appUrl: "https://certscore.ai",
        appPassword: "fixture",
      }),
      begin: async () => ({ email: "owner@example.test" }),
      load: async () => ({
        summary: aggregateFullSite({ ...state, status: "completed" }, []),
        pages: { rows: [] },
      }),
      transport: () => ({
        sendMail: async () => {
          throw Object.assign(new Error("fixture"), { command });
        },
        close: () => {},
      }),
      finish: async (...args: unknown[]) => {
        outcomes.push(args);
      },
    } as any);
    assert.equal(outcomes[0]![2], expected);
  }
});
