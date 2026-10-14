import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evidenceHeaderStatus, EvidenceHeaderStatus, evidenceSectionRecap } from "./evidence-header-status";
import { StatusBadge } from "./report-finding-row";
import { StatusBadge as AlternateStatusBadge } from "../scanso2/report-finding-row";

test("headers use evidence-scoped review labels without treating limited coverage as a concern", () => {
  assert.equal(evidenceHeaderStatus([{status:"Observed"},{status:"Context"},{status:"Not observed"}]), null);
  assert.equal(evidenceHeaderStatus([{status:"Limited"}])?.concern, false);
  assert.equal(evidenceHeaderStatus([{status:"Limited"},{status:"Needs review"}])?.label, "Review");
  assert.equal(evidenceHeaderStatus([{status:"Review signal"},{status:"Gap observed"}])?.label, "Review");
  assert.equal(evidenceHeaderStatus([{status:"Potential gap"},{status:"Partial concern",priority:"high"}])?.label, "Review");
  assert.equal(evidenceHeaderStatus([{status:"Limited",priority:"high"}])?.label, "Limited");
  assert.equal(evidenceHeaderStatus([{status:"Not observed",priority:"high"}]), null);
  assert.equal(evidenceHeaderStatus([{status:"Observed",priority:"high"}])?.label, "Review");
  assert.match(renderToStaticMarkup(<EvidenceHeaderStatus rows={[{status:"Limited"}]} />), /not a confirmed issue/);
  assert.equal(renderToStaticMarkup(<EvidenceHeaderStatus rows={[]} />), "");
});

test("section recaps separate review findings from coverage limitations", () => {
  assert.equal(evidenceSectionRecap([{status:"Review recommended"}, {status:"Not assessed"}, {status:"Observed"}]), "3 checks · 1 to review · 1 limited");
  assert.equal(evidenceSectionRecap([{status:"Not observed"}, {status:"Context"}]), "2 checks · No review flags");
  assert.equal(evidenceSectionRecap([{status:"Observed"}]), "1 check · 1 observed");
  assert.equal(evidenceSectionRecap([{status:"Feature not supported"}, {status:"Not assessed"}]), "2 checks · 1 limited · 1 not supported");
  assert.equal(evidenceSectionRecap([]), "No checks available");
  assert.equal(evidenceSectionRecap(Array.from({length: 40}, (_, index) => ({status: index < 12 ? "Potential gap" : index < 20 ? "Limited" : "Observed"}))), "40 checks · 12 to review · 8 limited");
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
