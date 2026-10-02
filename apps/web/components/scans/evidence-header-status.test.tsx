import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evidenceHeaderStatus, EvidenceHeaderStatus } from "./evidence-header-status";

test("headers expose the strongest existing flag without treating limited coverage as a concern", () => {
  assert.equal(evidenceHeaderStatus([{status:"Observed"},{status:"Context"},{status:"Not observed"}]), null);
  assert.equal(evidenceHeaderStatus([{status:"Limited"}])?.concern, false);
  assert.equal(evidenceHeaderStatus([{status:"Limited"},{status:"Needs review"}])?.label, "Review");
  assert.equal(evidenceHeaderStatus([{status:"Review signal"},{status:"Gap observed"}])?.label, "Flagged");
  assert.equal(evidenceHeaderStatus([{status:"Potential gap"},{status:"Partial concern",priority:"high"}])?.label, "High priority");
  assert.match(renderToStaticMarkup(<EvidenceHeaderStatus rows={[{status:"Limited"}]} />), /not a confirmed issue/);
  assert.equal(renderToStaticMarkup(<EvidenceHeaderStatus rows={[]} />), "");
});
