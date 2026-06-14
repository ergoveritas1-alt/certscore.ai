import assert from "node:assert/strict";
import test from "node:test";
import {
  consentStateForScenarioExecution,
  createConsentScenarioIdFactory,
} from "./scanners/consent-scenario-runner.js";

test("scenario ID factory is deterministic and isolated per scenario", () => {
  const rejectIds = createConsentScenarioIdFactory("reject_all_flow");
  const acceptIds = createConsentScenarioIdFactory("accept_all_flow");

  assert.deepEqual([
    rejectIds("net"),
    rejectIds("net"),
    rejectIds("cookie"),
    rejectIds("net"),
  ], [
    "net_reject_all_flow_1",
    "net_reject_all_flow_2",
    "cookie_reject_all_flow_1",
    "net_reject_all_flow_3",
  ]);
  assert.deepEqual([
    acceptIds("net"),
    acceptIds("cookie"),
  ], [
    "net_accept_all_flow_1",
    "cookie_accept_all_flow_1",
  ]);
});

test("scenario runner maps scenario consent states", () => {
  assert.equal(consentStateForScenarioExecution("baseline_pre_consent"), "pre_consent");
  assert.equal(consentStateForScenarioExecution("gpc_enabled"), "pre_consent");
  assert.equal(consentStateForScenarioExecution("accept_all_flow"), "post_accept");
  assert.equal(consentStateForScenarioExecution("reject_all_flow"), "post_reject");
  assert.equal(consentStateForScenarioExecution("privacy_opt_out_flow"), "post_reject");
});
