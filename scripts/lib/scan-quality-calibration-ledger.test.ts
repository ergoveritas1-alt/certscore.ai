import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCalibrationLedger,
  mergeCentralContactLedger,
  recordCalibrationOutcomes,
  selectCalibrationTargets,
  validateCalibrationLedger,
  type CalibrationTarget,
} from "./scan-quality-calibration-ledger.js";

const targets: CalibrationTarget[] = [
  { lanes: ["consent_controls"], role: "publisher", url: "https://publisher.example" },
  { lanes: ["consent_controls"], role: "publisher_global", url: "https://publisher-two.example" },
  { lanes: ["gdpr_transparency"], role: "ecommerce", url: "https://shop.example" },
  { lanes: ["transport_evidence"], role: "saas", url: "https://saas.example" },
];

test("selector excludes cooldown and blocked targets while preserving role diversity", () => {
  const ledger = createEmptyCalibrationLedger();
  ledger.entries["https://publisher.example"] = {
    consecutiveNoGoCount: 0,
    cooldownUntil: "2026-08-01T00:00:00.000Z",
    lastContactAt: "2026-07-10T00:00:00.000Z",
    lastContactSource: "calibration",
    lastNoGoReasons: [],
    lastOutcome: "completed",
    state: "cooldown",
    url: "https://publisher.example",
  };
  ledger.entries["https://publisher-two.example"] = {
    consecutiveNoGoCount: 1,
    lastContactAt: "2026-06-01T00:00:00.000Z",
    lastContactSource: "calibration",
    lastNoGoReasons: ["captcha"],
    lastOutcome: "no_go",
    state: "blocked",
    url: "https://publisher-two.example",
  };

  const selection = selectCalibrationTargets({
    ledger,
    limit: 2,
    minimumCooldownDays: 28,
    now: new Date("2026-07-20T00:00:00.000Z"),
    rotationKey: "release-1",
    targets,
  });

  assert.deepEqual(
    selection.selected.map((target) => target.role).sort(),
    ["ecommerce", "saas"],
  );
  assert.deepEqual(
    selection.excluded.map((entry) => entry.url).sort(),
    ["https://publisher-two.example", "https://publisher.example"].sort(),
  );
});

test("completed contact enters cooldown and becomes eligible after it expires", () => {
  const ledger = recordCalibrationOutcomes({
    ledger: createEmptyCalibrationLedger(),
    minimumCooldownDays: 28,
    now: new Date("2026-07-17T00:00:00.000Z"),
    summary: {
      generatedAt: "2026-07-17T00:00:00.000Z",
      results: [{ status: "completed", url: "https://shop.example" }],
    },
    targetUrls: new Set(targets.map((target) => target.url)),
  });

  assert.equal(ledger.entries["https://shop.example"]?.state, "cooldown");
  assert.throws(() =>
    selectCalibrationTargets({
      ledger,
      limit: 1,
      minimumCooldownDays: 28,
      now: new Date("2026-07-20T00:00:00.000Z"),
      rotationKey: "early",
      targets: [targets[2]!],
    }),
  );
  assert.equal(
    selectCalibrationTargets({
      ledger,
      limit: 1,
      minimumCooldownDays: 28,
      now: new Date("2026-08-15T00:00:00.000Z"),
      rotationKey: "late",
      targets: [targets[2]!],
    }).selected[0]?.url,
    "https://shop.example",
  );
});

test("no-go outcomes block once and retire after a reviewed second attempt", () => {
  const first = recordCalibrationOutcomes({
    ledger: createEmptyCalibrationLedger(),
    minimumCooldownDays: 28,
    now: new Date("2026-07-17T00:00:00.000Z"),
    summary: {
      results: [
        {
          runtime: { noGoCandidate: true, noGoReasons: ["captcha"] },
          status: "completed",
          url: "https://saas.example",
        },
      ],
    },
    targetUrls: new Set(targets.map((target) => target.url)),
  });
  assert.equal(first.entries["https://saas.example"]?.state, "blocked");

  const reviewed = structuredClone(first);
  reviewed.entries["https://saas.example"]!.state = "eligible";
  const second = recordCalibrationOutcomes({
    ledger: reviewed,
    minimumCooldownDays: 28,
    now: new Date("2026-09-01T00:00:00.000Z"),
    summary: {
      results: [
        {
          runtime: { noGoCandidate: true, noGoReasons: ["rate_limited"] },
          status: "completed",
          url: "https://saas.example",
        },
      ],
    },
    targetUrls: new Set(targets.map((target) => target.url)),
  });
  assert.equal(second.entries["https://saas.example"]?.state, "do_not_calibrate");
  assert.equal(second.entries["https://saas.example"]?.consecutiveNoGoCount, 2);
});

test("ledger validation rejects unknown targets", () => {
  const ledger = createEmptyCalibrationLedger();
  ledger.entries["https://unknown.example"] = {
    consecutiveNoGoCount: 0,
    lastNoGoReasons: [],
    state: "eligible",
    url: "https://unknown.example",
  };
  assert.match(validateCalibrationLedger(ledger, new Set(targets.map((target) => target.url))).join("\n"), /unknown target/);
});

test("central all-channel history overrides repository eligibility", () => {
  const merged = mergeCentralContactLedger({
    centralRecords: [
      {
        consecutiveNoGoCount: 1,
        cooldownUntil: "2026-09-01T00:00:00.000Z",
        effectiveState: "blocked",
        lastContactAt: "2026-08-04T00:00:00.000Z",
        lastNoGoReasons: ["captcha"],
        lastOutcome: "no_go",
        lastSource: "pulse_sdk",
        normalizedDomain: "saas.example",
      },
    ],
    ledger: createEmptyCalibrationLedger(),
    now: new Date("2026-08-05T00:00:00.000Z"),
    targets,
  });

  assert.equal(merged.entries["https://saas.example"]?.state, "blocked");
  assert.equal(merged.entries["https://saas.example"]?.lastContactSource, "pulse_sdk");
  assert.deepEqual(merged.entries["https://saas.example"]?.lastNoGoReasons, ["captcha"]);
});
