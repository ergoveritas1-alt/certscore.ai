import test from "node:test";
import assert from "node:assert/strict";
import { article13DisclosureRejectReason } from "./article13-disclosure-rejection";
const modes = ["scan_core", "retained_report", "multilingual_classifier"] as const;
const topic = "recipients_or_vendor_categories";
test("inbound sources do not become outbound recipient disclosures", () => {
  for (const text of [
    "We may also receive personal information from third-party sources such as social media platforms, advertising networks, internet service providers, and data brokers.",
    "The company may collect personal information from advertising partners and analytics providers.",
  ]) for (const mode of modes) assert.equal(article13DisclosureRejectReason(text, topic, { mode }), "insufficient_row_specific_terms");
});
test("opt-out footer beside a company copyright does not identify a recipient", () => {
  const text = "Privacy | Cookie Settings | Do Not Sell or Share My Personal Information | Report Ethical Hacking Copyright Publisher Inc., All Rights Reserved.";
  for (const mode of modes) assert.equal(article13DisclosureRejectReason(text, topic, { mode }), "insufficient_row_specific_terms");
});
test("a separate outbound statement survives inbound sources and opt-out labels", () => {
  for (const prefix of ["We may also receive personal information from advertising partners. ", "Do Not Sell or Share My Personal Information. "]) {
    const text = prefix + "We share personal information with payment processors to complete your purchase.";
    for (const mode of modes) assert.equal(article13DisclosureRejectReason(text, topic, { mode }), null);
  }
});
test("a recipient receiving data is not confused with the controller receiving data", () => {
  const text = "Our payment processors receive personal information to complete your purchase and handle billing.";
  for (const mode of modes) assert.equal(article13DisclosureRejectReason(text, topic, { mode }), null);
});
