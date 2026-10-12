import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evidenceHeaderStatus, EvidenceHeaderStatus } from "./evidence-header-status";
import { StatusBadge } from "./report-finding-row";
import { StatusBadge as AlternateStatusBadge } from "../scanso2/report-finding-row";

test("headers use evidence-scoped review labels without treating limited coverage as a concern", () => {
  assert.equal(evidenceHeaderStatus([{status:"Observed"},{status:"Context"},{status:"Not observed"}]), null);
  assert.equal(evidenceHeaderStatus([{status:"Limited"}])?.concern, false);
  assert.equal(evidenceHeaderStatus([{status:"Limited"},{status:"Needs review"}])?.label, "Review");
  assert.equal(evidenceHeaderStatus([{status:"Review signal"},{status:"Gap observed"}])?.label, "Issues found");
  assert.equal(evidenceHeaderStatus([{status:"Potential gap"},{status:"Partial concern",priority:"high"}])?.label, "Review recommended");
  assert.equal(evidenceHeaderStatus([{status:"Limited",priority:"high"}])?.label, "Limited");
  assert.equal(evidenceHeaderStatus([{status:"Not observed",priority:"high"}]), null);
  assert.equal(evidenceHeaderStatus([{status:"Observed",priority:"high"}])?.label, "Review recommended");
  assert.match(renderToStaticMarkup(<EvidenceHeaderStatus rows={[{status:"Limited"}]} />), /not a confirmed issue/);
  assert.equal(renderToStaticMarkup(<EvidenceHeaderStatus rows={[]} />), "");
});

test("review headers retain the underlying rows and use amber rather than emergency styling", () => {
  for (const status of ["Potential gap", "Gap observed", "Partial concern", "Review signal", "Warning"]) {
    const rows = [{ status, priority: "high" as const }];
    const original = structuredClone(rows);
    const html = renderToStaticMarkup(<EvidenceHeaderStatus rows={rows} />);
    assert.match(html, /border-amber-200/);
    assert.match(html, /M12 3 2 21h20Z/, "section review badge keeps its warning indicator");
    assert.doesNotMatch(html, /High priority|Flagged|rose-|red-/);
    assert.deepEqual(rows, original);
  }
});

test("individual review badges omit warning triangles while preserving labels and positive indicators", () => {
  for (const status of ["Potential gap", "Partial concern"] as const) {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    assert.match(html, new RegExp(`>${status}<`));
    assert.doesNotMatch(html, /<svg/);
  }
  const review = renderToStaticMarkup(<StatusBadge status="Observed" priority="high" />);
  assert.match(review, />Review</);
  assert.doesNotMatch(review, /<svg/);
  const alternate = renderToStaticMarkup(<AlternateStatusBadge status="Potential gap" />);
  assert.match(alternate, /Potential gap/);
  assert.doesNotMatch(alternate, /<svg/);
  assert.match(renderToStaticMarkup(<StatusBadge status="Observed" />), /m5 12 4 4L19 6/);
});
