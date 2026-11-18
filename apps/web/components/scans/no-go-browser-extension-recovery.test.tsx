import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NoGoBrowserExtensionRecovery } from "./no-go-browser-extension-recovery";
import { noGoBrowserGuidance } from "../../lib/scans/no-go-browser-guidance";

const scan = {status: "completed", pagesScanned: 0, pageUrl: "https://example.com/"};
function input(reason: string, snapshot: Record<string, unknown> = {}, extraReasons: string[] = []) {
  return {scan, snapshot, runtimeArtifacts: {scan_no_go_assessment: {
    decision: "no_go", reasonCodes: [reason, ...extraReasons], supportingSignals: {},
  }}};
}
const render = (guidance: ReturnType<typeof noGoBrowserGuidance>) =>
  renderToStaticMarkup(<NoGoBrowserExtensionRecovery guidance={guidance} />);

test("recommends a separate reviewer-started scan only for a public capture or a documented challenge", () => {
  for (const reason of ["blank_or_unusable_page", "loading_or_stalled", "runtime_capture_unverified", "visual_capture_failed_or_placeholder"]) {
    assert.equal(noGoBrowserGuidance(input(reason)), "capture");
  }
  for (const record of [input("captcha_or_challenge"), input("access_denied_or_forbidden_page", {captcha_flag: true}),
    input("access_denied_or_forbidden_page", {block_page_classification: "vendor_interstitial_probable", challenge_suspected: true})]) {
    const guidance = noGoBrowserGuidance(record);
    assert.equal(guidance, "challenge");
    const html = render(guidance);
    assert.match(html, /href="\/browser-extension"/);
    assert.match(html, /opens directly in Chrome while you’re signed out of the site/);
    assert.match(html, /clears site data/);
  }
});

test("an explicit robots stop takes priority over a challenge, including on older reports", () => {
  for (const record of [input("captcha_or_challenge", {robots_allowed: false}), input("robots_restricted"),
    {scan, runtimeArtifacts: null, snapshot: {stop_reason_code: "robots_blocked"}},
    {scan, runtimeArtifacts: null, events: [{eventType: "runtime.build_phase_diagnostic", metadataJson: {phase: "scan_short_circuit", reason: "robots_disallowed"}}]}]) {
    const guidance = noGoBrowserGuidance(record);
    assert.equal(guidance, "robots");
    assert.match(render(guidance), /Choose a URL that permits scanning/);
    assert.doesNotMatch(render(guidance), /href=/);
  }
});

test("withholds the extension for site errors, ambiguous denials, and conflicting evidence", () => {
  for (const reason of ["access_denied_or_forbidden_page", "unknown", "authentication_required", "rate_limited_429", "not_found_404",
    "server_error_5xx", "maintenance_or_unavailable", "unsupported_region", "tls_or_certificate_error",
    "redirect_only_page", "target_unreachable_or_unsuitable", "navigation_transport_failure", "parked_or_placeholder"]) {
    assert.equal(noGoBrowserGuidance(input(reason)), undefined, reason);
  }
  for (const record of [input("captcha_or_challenge", {}, ["rate_limited_429"]), input("auth_wall", {captcha_flag:true}),
    input("captcha_or_challenge", {homepage_fetch_http_status:401}), input("captcha_or_challenge", {auth_wall_detected:true}),
    input("runtime_capture_unverified", {homepage_fetch_http_status:403}),
    input("runtime_capture_unverified", {}, ["homepage_blocked_403"]),
    input("captcha_or_challenge", {robots_allowed:false, robots_fetch_status:"timeout"}),
    input("captcha_or_challenge", {stop_reason_code:"robots_delay_exceeds_crawl_budget"}),
    input("access_denied_or_forbidden_page", {block_vendor_guess:"cloudflare"}),
    {...input("captcha_or_challenge"), scan:{...scan,scanType:"browser_extension"}},
    {...input("captcha_or_challenge"), scan:{...scan,scanFromValue:"local_extension"}},
    {...input("captcha_or_challenge"), scan:{...scan,pageUrl:"http://127.0.0.1/"}},
    {...input("captcha_or_challenge"), scan:{...scan,status:"running"}},
    {scan:{...scan,pagesScanned:2},runtimeArtifacts:null,snapshot:{robots_allowed:false}},
    {scan,runtimeArtifacts:null,snapshot:{scan_outcome:"no_go"}},
    {scan,runtimeArtifacts:{scan_no_go_assessment:{decision:"continue_with_diagnostics"}},snapshot:{scan_outcome:"captcha"}},
  ]) assert.equal(render(noGoBrowserGuidance(record)), "");
});
