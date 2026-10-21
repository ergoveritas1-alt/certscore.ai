import assert from "node:assert/strict";
import test from "node:test";
import { classifyConsentControlLabel } from "./consent-control-label-classifier.js";

test("exact Russian Reject shares observation and action semantics only in consent context", () => {
  for (const label of ["Отклонить", "отклонить", " ОТКЛОНИТЬ "]) {
    for (const usage of ["observation", "action"] as const) {
      const result = classifyConsentControlLabel({ label, usage, hasConsentContext: true, classifierProfile: "multilingual_v1" });
      assert.equal(result.intent, "reject");
      assert.ok(result.confidence >= 0.8);
      assert.equal(classifyConsentControlLabel({ label, usage }).intent, "unknown");
    }
  }
  for (const label of ["Отклонить заказ", "Почему отклонить", "Отклонить или принять", "Принять", "Настроить"]) {
    assert.equal(classifyConsentControlLabel({ label, usage: "action", hasConsentContext: true, classifierProfile: "multilingual_v1" }).intent, "unknown", label);
  }
});
