import assert from "node:assert/strict";
import test from "node:test";
import { parseNamedCmpPartnerDisclosure } from "./cmp-named-disclosure";
import { cmpBasicEvidenceSchema } from "./cmp-audit-evidence";

test("counted CMP partners are literal names with a retained witness, not cookie/vendor guesses", () => {
  const result = parseNamedCmpPartnerDisclosure("For this, we use unique identifiers like your IP address and share your data with 2 partners (Vimeo, Google). By clicking accept, you consent.");
  assert.deepEqual(result?.names, ["Vimeo", "Google"]);
  assert.equal(result?.excerpt, "and share your data with 2 partners (Vimeo, Google)");
  for (const text of ["We do not share your data with 2 partners (Vimeo, Google)",
    "We might collect and share your data with 2 partners (Vimeo, Google)",
    "For example, we share your data with 2 partners (Vimeo, Google)",
    "We share your data with 3 partners (Vimeo, Google)", "We share your data with 2 partners (Vimeo, Vimeo)",
    "We share your data with 1 partner (google.com)", "We use Google cookies", "_ga", "x".repeat(4097),
    "We share your data with 1 partner (Google). We share your data with 1 partner (Vimeo)."])
    assert.equal(parseNamedCmpPartnerDisclosure(text), undefined, text);
});

test("typed disclosure rejects names not present in its literal source", () => {
  const packet = { contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:"fixture",targetUrl:"https://example.test/",documentUrl:"https://example.test/",documentToken:"loader",capturedAtMs:1,provider:"OneTrust",controls:[],privacyLinks:[],declarations:[],serviceNames:[],limitations:[],serviceDisclosures:[parseNamedCmpPartnerDisclosure("We share your data with 2 partners (Vimeo, Google)")] };
  assert.ok(cmpBasicEvidenceSchema.safeParse(packet).success);
  packet.serviceDisclosures[0]!.names = ["Guessed Analytics", "Google"];
  assert.equal(cmpBasicEvidenceSchema.safeParse(packet).success,false);
});
