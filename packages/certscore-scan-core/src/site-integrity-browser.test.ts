import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
import { SITE_INTEGRITY_LIMITS } from "@certscore/contracts";

test("runtime capture retains concealed outbound links, excludes ordinary hidden UI, and never follows destinations", { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html lang="en"><title>Clinic fixture</title><body>
      <h1>Clinic fixture</h1><p>Public clinic services and opening hours. This deterministic fixture contains no tracking or personal information collection.</p>
      <div style="width:0;height:0;overflow:hidden"><a href="https://pharmacy.example/?secret=never-retain">Pharmacy promotion</a></div>
      <style>.offscreen { position:absolute; left:-9999px; top:-9999px }</style><p class="offscreen" data-private="never-retain" onclick="never-retain"><a href="https://promotion.example/path/never-retain">Promotion</a></p>
      <span style="font-size:0"><a href="https://third.example/">Third promotion</a></span>
      <a href="https://visible.example/">Ordinary visible link</a>
      <span style="font-size:0"><a href="https://reset.example/" style="font-size:16px">Visible restored text</a></span>
      <a style="font-size:0" href="https://child-reset.example/"><span style="font-size:16px">Visible child text</span></a>
      <div style="width:0;height:0;overflow:hidden"><a href="https://escape.example/" style="position:fixed;left:20px;top:40px">Visible escaped clip</a></div>
      <div style="position:absolute;left:-9999px"><a href="https://restored.example/" style="position:fixed;left:20px;top:20px">Visible restored position</a></div>
      <a href="/same-site" style="font-size:0">Same site</a>
      <nav style="font-size:0"><a href="https://nav.example/">Hidden responsive navigation</a></nav>
      <span class="sr-only" style="position:absolute;left:-9999px"><a href="https://accessible.example/">Screen reader help</a></span>
      <div hidden><a href="https://collapsed.example/" style="font-size:0">Collapsed link</a></div>
      <a href="https://icon.example/" style="font-size:0">Icon link<svg width="10" height="10"></svg></a>
      <div style="position:absolute;left:-9999px;clip:rect(0,0,0,0)"><a href="https://clip.example/">Clipped accessibility label</a></div>
    </body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "certscore-site-integrity-"));
  try {
    const artifactWriter = await createArtifactWriter(root);
    const run = (gpc: boolean, executionProfile?: "inventory_only") => preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 10_000,
      artifactWriter, executionProfile, captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast", globalPrivacyControlEnabled: gpc });
    const result = await run(false);
    const observation = result.siteIntegrityObservation;
    assert.ok(observation, JSON.stringify(result.moduleRun));
    assert.deepEqual(observation.links.map(link => link.destinationDomain), ["pharmacy.example", "promotion.example", "third.example"]);
    assert.deepEqual(observation.links.map(link => link.concealment), ["zero_size_container", "offscreen_position", "zero_font_size"]);
    for (const link of observation.links) {
      if (!link.codeProof) { assert.equal(link.codeProofUnavailableReason, "capture_limit"); continue; }
      assert.ok(new TextEncoder().encode(JSON.stringify(link.codeProof)).length <= SITE_INTEGRITY_LIMITS.codeProofBytes);
      assert.match(link.codeProof.lines.join("\n"), /href=/);
      assert.doesNotMatch(link.codeProof.lines.join("\n"), /onclick|data-private|<script|<style|Pharmacy promotion/);
    }
    assert.ok(observation.links[0]!.codeProof);
    assert.ok(observation.links.reduce((total, link) => total + (link.codeProof ? new TextEncoder().encode(JSON.stringify(link.codeProof)).length : 0), 0) <= SITE_INTEGRITY_LIMITS.codeProofPageBytes);
    const offscreen = observation.links[1]!.codeProof!;
    assert.ok(offscreen);
    assert.equal(offscreen.computedStyle.position, "absolute");
    assert.ok(offscreen.linkRect.right < -1000);
    assert.equal(offscreen.lines[offscreen.highlightedLine]?.trim(), "<p>", "external CSS is explained by computed evidence, never invented inline styles");
    assert.ok(result.domSnapshots.some(snapshot => snapshot.documentIdentity?.token === observation.documentToken));
    assert.doesNotMatch(JSON.stringify(observation), /never-retain|secret/);
    assert.ok(result.networkEvents.every(event => !/pharmacy\.example|promotion\.example|third\.example/.test(event.requestUrl)));
    const additional = await run(false, "inventory_only");
    assert.equal(additional.siteIntegrityObservation?.scope, "additional_page_main_document");
    assert.equal(additional.siteIntegrityObservation?.contractVersion, "certscore.site-integrity-observation.v2");
    assert.deepEqual(additional.siteIntegrityObservation?.links, observation.links);
    assert.equal((await run(true)).siteIntegrityObservation, undefined, "GPC cannot produce the baseline integrity observation");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("every retained hidden link keeps its surrounding code, including repeated destinations", { timeout: 60_000 }, async () => {
  const domains = ["pharmacy.example", "other-pharmacy.example", "promotion.example", "mobile.example"];
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html lang="en"><title>Hidden-link excerpt fixture</title><body>
      <h1>Public services</h1><p>Opening hours and contact information.</p>
      <section><div style="position:absolute;left:-9999px;top:-9999px">
        ${Array.from({ length: SITE_INTEGRITY_LIMITS.retainedLinks }, (_, index) =>
          `<a href="https://${domains[Math.min(index, domains.length - 1)]}/private-path?token=never-retain" onclick="never-retain" data-private="never-retain">Private link text ${index}</a>`).join("\n")}
      </div></section>
    </body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "certscore-site-integrity-excerpts-"));
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 10_000,
      artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast" });
    const observation = result.siteIntegrityObservation;
    assert.ok(observation, JSON.stringify(result.moduleRun));
    assert.equal(observation.links.length, SITE_INTEGRITY_LIMITS.retainedLinks);
    for (const link of observation.links) {
      assert.ok(link.codeProof, `${link.evidenceRef}: ${link.destinationDomain} needs retained surrounding code`);
      assert.equal(link.codeProofUnavailableReason, undefined);
      assert.match(link.codeProof.lines.join("\n"), /<section>/);
      assert.match(link.codeProof.lines[link.codeProof.highlightedLine]!, /position:absolute;left:-9999px;top:-9999px/);
      assert.ok(link.codeProof.lines.some(line => line.includes(`https://${link.destinationDomain}/[redacted]`)));
      assert.ok(new TextEncoder().encode(JSON.stringify(link.codeProof)).length <= SITE_INTEGRITY_LIMITS.codeProofBytes);
    }
    assert.ok(observation.links.reduce((total, link) => total + new TextEncoder().encode(JSON.stringify(link.codeProof)).length, 0) <= SITE_INTEGRITY_LIMITS.codeProofPageBytes);
    assert.doesNotMatch(JSON.stringify(observation), /never-retain|private-path|token=|onclick|data-private|Private link text/);
    assert.ok(result.networkEvents.every(event => !domains.some(domain => event.requestUrl.includes(domain))));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
