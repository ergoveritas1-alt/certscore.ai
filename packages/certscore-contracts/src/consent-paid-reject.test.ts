import assert from "node:assert/strict";
import test from "node:test";
import { classifyConsentControlLabel } from "./consent-control-label-classifier";

test("Spanish price-bound Reject labels retain the paid-choice variant", () => {
  for (const label of [
    "Rechazar por 36€ / año: Denegar nuestro procesamiento de datos y cerrar",
    "Rechazar por 3,99 € / mes",
    "Rechazar por € 36 / año",
    "Rechazar por 36 euros al año",
  ]) for (const usage of ["observation", "action"] as const) {
    const result = classifyConsentControlLabel({ label, usage, hasConsentContext: true });
    assert.equal(result.intent, "reject", label);
    assert.equal(result.variant, "reject_with_payment", label);
    assert.ok(result.reasonCodes.includes("variant_reject_with_payment"));
  }
});

test("paid Reject classification cannot borrow a price from another label or context", () => {
  for (const input of [
    { label: "Rechazar por privacidad", contextText: "Cookies. Suscribirse por 36€ / año." },
    { label: "Rechazar por privacidad 36€", hasConsentContext: true },
    { label: "Rechazar por", ariaLabel: "36€ / año", hasConsentContext: true },
    { label: "Rechazar todo", contextText: "We use cookies. Subscribe for 36€ per year." },
    { label: "Rechazar por 0€", hasConsentContext: true },
  ]) assert.notEqual(classifyConsentControlLabel(input).variant, "reject_with_payment", JSON.stringify(input));
  assert.equal(classifyConsentControlLabel({ label: "Rechazar todo", usage: "action", hasConsentContext: true }).intent, "reject");
});
