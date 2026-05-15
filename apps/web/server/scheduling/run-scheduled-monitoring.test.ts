import assert from "node:assert/strict";
import test from "node:test";
import {
  getScheduledMonitoringDecision,
  resolveScheduledMonitoringFrequency
} from "./scheduled-monitoring-decision";

test("resolveScheduledMonitoringFrequency prefers domain frequency over settings and plan", () => {
  assert.equal(
    resolveScheduledMonitoringFrequency({
      domainFrequency: "daily",
      organizationPlan: "free",
      settingsFrequency: "weekly"
    }),
    "daily"
  );
});

test("getScheduledMonitoringDecision marks never-scanned non-manual domains due", () => {
  const decision = getScheduledMonitoringDecision({
    activeScanExists: false,
    domainFrequency: "weekly",
    lastCompletedAt: null,
    now: new Date("2026-05-15T00:00:00Z"),
    organizationPlan: "free",
    settingsFrequency: null
  });

  assert.deepEqual(decision, {
    due: true,
    frequency: "weekly",
    reason: "due"
  });
});

test("getScheduledMonitoringDecision skips active scans before due evaluation", () => {
  const decision = getScheduledMonitoringDecision({
    activeScanExists: true,
    domainFrequency: "daily",
    lastCompletedAt: "2026-05-01T00:00:00Z",
    now: new Date("2026-05-15T00:00:00Z"),
    organizationPlan: "free",
    settingsFrequency: null
  });

  assert.deepEqual(decision, {
    due: false,
    frequency: "daily",
    reason: "active_scan_exists"
  });
});

test("getScheduledMonitoringDecision skips manual monitor state", () => {
  const decision = getScheduledMonitoringDecision({
    activeScanExists: false,
    domainFrequency: "manual",
    lastCompletedAt: null,
    now: new Date("2026-05-15T00:00:00Z"),
    organizationPlan: "free",
    settingsFrequency: "daily"
  });

  assert.deepEqual(decision, {
    due: false,
    frequency: "manual",
    reason: "manual_frequency"
  });
});

test("getScheduledMonitoringDecision skips domains not yet due", () => {
  const decision = getScheduledMonitoringDecision({
    activeScanExists: false,
    domainFrequency: "weekly",
    lastCompletedAt: "2026-05-14T00:00:00Z",
    now: new Date("2026-05-15T00:00:00Z"),
    organizationPlan: "free",
    settingsFrequency: null
  });

  assert.deepEqual(decision, {
    due: false,
    frequency: "weekly",
    reason: "not_due"
  });
});
