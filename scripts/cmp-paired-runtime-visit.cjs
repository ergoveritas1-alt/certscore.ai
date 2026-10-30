/* CertScore.ai local canonical action-lane visit. Invoked only by the durable runner. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
function boundedDiagnosticBody(headers, maxBytes) {
  const length = headers['content-length'];
  const encoding = (headers['content-encoding'] ?? 'identity').trim().toLowerCase();
  return typeof length === 'string' && /^[1-9]\d*$/.test(length) &&
    Number.isSafeInteger(Number(length)) && Number(length) <= maxBytes && encoding === 'identity';
}
const diagnosticWindowOpen = (open, deadline, now) => open && now < deadline;
function assertSerializedPacketMatches(bytes, packet) {
  // Optional undefined object fields are absent in the canonical JSON artifact.
  assert.deepEqual(JSON.parse(bytes), JSON.parse(JSON.stringify(packet)));
}
function canonicalEvidenceFailure(error, verifying) {
  return verifying || Boolean(error && typeof error === 'object' && (error.name === 'ZodError' || Array.isArray(error.issues)));
}
function navigationFailureReasons(row) {
  const reasons=[];
  if(row.navigation?.outcome==='failed'||row.navigation?.documentCommitted===false)reasons.push('navigation_failed_or_uncommitted');
  if(row.navigation?.finalUrlAuthorized===false||(row.limitations??[]).some(v=>/^(redirect_target_not_authorized|unsafe_target_blocked|target_navigation_failed:)/.test(v)))reasons.push('navigation_target_not_authorized');
  return reasons;
}
module.exports = { boundedDiagnosticBody, diagnosticWindowOpen, assertSerializedPacketMatches, canonicalEvidenceFailure, navigationFailureReasons };

function modules(root) {
  const core = path.join(root, 'packages/certscore-scan-core/dist');
  return {
    chromium: require(path.join(root, 'node_modules/playwright')).chromium,
    holds: require(path.join(core, 'public-test-contact-holds.js')),
    contracts: require(path.join(root, 'packages/certscore-contracts/dist/index.js')),
    accept: require(path.join(core, 'post-accept-cmp-recipes.js')),
    reject: require(path.join(core, 'post-refusal-cmp-recipes.js')),
    runAccept: require(path.join(core, 'post-accept-observer.js')).runPostAcceptObserver,
    runReject: require(path.join(core, 'post-refusal-observer.js')).runPostRefusalObserver,
  };
}

if (require.main === module && args[0] === '--preflight') {
  const [, root, executable] = args;
  const loaded = modules(root);
  assert.equal(typeof loaded.runAccept, 'function');
  assert.equal(typeof loaded.runReject, 'function');
  assert.equal(typeof loaded.contracts.projectPostAcceptEvidenceForReport, 'function');
  assert.equal(typeof loaded.contracts.projectPostRefusalEvidenceForReport, 'function');
  assert(fs.statSync(executable).isFile());
  console.log(JSON.stringify({ offlinePreflight: 'passed', root, node: process.version,
    playwrightVersion: require(path.join(root, 'node_modules/playwright/package.json')).version,
    browserExecutablePath: executable, publicContacts: 0 }));
} else if (require.main === module) {
  void main().catch(error => { console.error(error); process.exitCode = 1; });
}

async function main() {
  const [root, out, targetUrl, action, arm, claimPath] = args;
  assert(['accept', 'reject'].includes(action));
  assert(['reference', 'candidate'].includes(arm));
  const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
  assert.equal(path.resolve(claimPath), path.resolve(out, 'claim.json'));
  for (const [key, value] of Object.entries({ url: targetUrl, action, arm, status: 'claimed' })) assert.equal(claim[key], value);
  assert.equal(claim.runtime.nodeVersion, process.version);
  assert.equal(claim.runtime.nodeSha256, hash(fs.readFileSync(process.execPath)));
  assert.deepEqual(claim.budgets, { searchMs: 14000, confirmationMs: 2000, resultMs: 20000, acceptObservationMs: 3000, rejectObservationMs: 8000 });
  const save = (name, value) => {
    const fd = fs.openSync(path.join(out, name), 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  };
  const { chromium, holds, contracts, accept, reject, runAccept, runReject } = modules(root);
  holds.assertPublicTestContactAllowed(targetUrl, 'owner-approved fixed local CMP comparison');
  process.env.CERTSCORE_HTTP_USER_AGENT = 'ConsentCheckBot/1.0 (+https://certscore.ai/crawler)';
  process.env.CERTSCORE_CHROMIUM_LOCALE = 'en-US';
  process.env.CERTSCORE_CHROMIUM_TIMEZONE_ID = 'America/Los_Angeles';
  const row = { url: targetUrl, action, arm, scanId: claim.scanId, slotId: claim.slotId, pairId: claim.pairId,
    sourceFingerprint: claim.sourceFingerprint, buildFingerprint: claim.buildFingerprint, planSha256: claim.planSha256,
    startedAt: new Date().toISOString(), status: 'running', scannerRuntimeStarted: false,
    dispatchTargetSha256: hash(new URL(targetUrl).toString()) };
  save('attempt.json', row);
  const network = [], errors = [];
  let browser, verifying = false, diagnosticsOpen = true, sdkBodyAttempted = false, configBodies = 0;
  let diagnosticDeadline = 0;
  const canCapture = () => diagnosticWindowOpen(diagnosticsOpen, diagnosticDeadline, performance.now());
  try {
    assert.equal(hash(fs.readFileSync(claim.runtime.browserExecutablePath)), claim.runtime.browserExecutableSha256);
    browser = await chromium.launch({ headless: true, executablePath: claim.runtime.browserExecutablePath });
    row.scannerRuntimeStarted = true;
    // Conservative contact marker: browser launched, before context/navigation. Never equates to success.
    save('contact-started.json', { ...row, at: new Date().toISOString(), event: 'contact_started' });
    const original = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await original({ ...options, ignoreHTTPSErrors: false });
      context.on('page', page => {
        page.on('response', response => {
          try {
            const request = response.request();
            if (request.isNavigationRequest() && request.frame() === page.mainFrame() && network.length < 16)
              network.push({ url: response.url(), status: response.status(), at: Date.now() });
          } catch { /* detached frame is unavailable evidence */ }
        });
        page.on('pageerror', error => { if (errors.length < 8) errors.push(String(error).slice(0, 240)); });
        // Retain bounded existing-response diagnostics only. No requests/waits/SDK calls are added.
        page.on('response', response => {
          try {
            if (!canCapture()) return;
            const url = new URL(response.url()), request = response.request();
            if (configBodies < 3 && ['cdn.cookielaw.org', 'cookie-cdn.cookiepro.com'].includes(url.hostname) &&
                url.pathname.startsWith('/consent/') && url.pathname.endsWith('.json') &&
                request.frame() === page.mainFrame() && response.status() === 200) {
              const index = configBodies++;
              if (!boundedDiagnosticBody(response.headers(), 1048576)) return;
              void response.body().then(bytes => {
                if (!canCapture() || bytes.length > 1048576) return;
                JSON.parse(bytes.toString());
                fs.writeFileSync(path.join(out, `served-config-${index}.json`), bytes, { flag: 'wx' });
                save(`served-config-${index}-receipt.json`, { url: response.url(), bytes: bytes.length,
                  sha256: hash(bytes), existingResponseOnly: true, diagnosticOnly: true });
              }).catch(() => {});
            }
            if (!sdkBodyAttempted && ['cdn.cookielaw.org', 'cookie-cdn.cookiepro.com'].includes(url.hostname) &&
                /\/otBannerSdk\.js$/.test(url.pathname) && request.resourceType() === 'script' &&
                request.frame() === page.mainFrame() && response.status() === 200) {
              sdkBodyAttempted = true;
              if (!boundedDiagnosticBody(response.headers(), 2097152)) return;
              void response.body().then(bytes => {
                if (!canCapture() || bytes.length > 2097152) return;
                fs.writeFileSync(path.join(out, 'served-otBannerSdk.js'), bytes, { flag: 'wx' });
                save('served-sdk-receipt.json', { url: response.url(), bytes: bytes.length,
                  sha256: hash(bytes), existingResponseOnly: true, diagnosticOnly: true });
              }).catch(() => {});
            }
          } catch { /* capture omission is not evidence of absence */ }
        });
      });
      return context;
    };
    const library = action === 'accept' ? accept : reject;
    const recipes = action === 'accept' ? library.buildCanonicalPostAcceptActionRecipes() : library.buildCanonicalPostRefusalActionRecipes();
    const common = { browser, url: targetUrl, parentScanId: claim.scanId, scanId: claim.scanId + '-' + action,
      recipe: recipes[0], recipeCandidates: recipes,
      recipeSetId: action === 'accept' ? library.CANONICAL_POST_ACCEPT_RECIPE_SET_ID : library.CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
      interactionAuthorization: { authorizationId: 'sharded_scan_resolved_exact_target.v2', kind: 'scan_target_resolution',
        requestedUrl: targetUrl, scanId: claim.scanId, maxRedirects: 8, resolutionTimeoutMs: 5000 },
      actionSearchTimeoutMs: 14000, confirmationTimeoutMs: 2000, resultBudgetMs: 20000,
      observationWindowMs: action === 'accept' ? 3000 : 8000, productionProjectable: true, outDir: out };
    diagnosticDeadline = performance.now() + common.resultBudgetMs;
    let packet;
    try {
      packet = action === 'accept' ? await runAccept({ ...common, allowCanonicalAcceptDiscovery: true }) :
        await runReject({ ...common, allowCanonicalRejectDiscovery: true });
    } finally { diagnosticsOpen = false; }
    verifying = true;
    const parsed = (action === 'accept' ? contracts.postAcceptEvidencePacketSchema : contracts.postRefusalEvidencePacketSchema).parse(packet);
    assert.equal(parsed.scanId, claim.scanId + '-' + action);
    assert.equal(parsed.parentScanId, claim.scanId);
    const initialUrl = new URL(targetUrl); initialUrl.hash = ''; initialUrl.search = '';
    assert.equal(parsed.normalizedUrl, initialUrl.toString());
    const file = action === 'accept' ? 'PostAcceptEvidencePacket.json' : 'PostRefusalEvidencePacket.json';
    const bytes = fs.readFileSync(path.join(out, file));
    assertSerializedPacketMatches(bytes, packet);
    const packetSha256 = hash(bytes);
    const projection = (action === 'accept' ? contracts.projectPostAcceptEvidenceForReport : contracts.projectPostRefusalEvidenceForReport)({ packet: parsed, packetSha256 });
    save('projection.json', projection);
    row.actionOutcome = contracts.consentActionOutcome ? contracts.consentActionOutcome(projection) :
      projection.execution?.consentConfirmed ? 'consent_decision_confirmed' : projection.execution?.clickCompleted ?
        'completed_unconfirmed' : projection.execution ? 'not_completed' : 'unknown';
    row.notificationClassificationSupported = typeof contracts.consentActionOutcome === 'function';
    row.notificationAcknowledgment = projection.notificationAcknowledgment ?? null;
    row.oneTrustApplicability = packet.decisionEvidence?.oneTrustGroupEvidence?.applicability ??
      packet.terminalDecisionEvidence?.evidence?.oneTrustGroupEvidence?.applicability ?? null;
    Object.assign(row, { status: 'completed', packetSha256, packetBytes: bytes.length, packetFile: file,
      projectionSha256: hash(fs.readFileSync(path.join(out, 'projection.json'))), canonicalVerificationCompleted: true,
      nativeProjection: { path: path.join(out, 'projection.json'), sha256: hash(fs.readFileSync(path.join(out, 'projection.json'))),
        bytes: fs.statSync(path.join(out, 'projection.json')).size },
      registration: packet.acceptanceRegistration ?? packet.refusalRegistration, execution: projection.execution,
      decisionEvidence: packet.decisionEvidence, resolver: packet.resolver, diagnostics: packet.confirmationDiagnostics,
      navigation: packet.interactionDiagnostics?.navigation, timing: packet.timing, limitations: packet.limitations, projectionStatus: projection.status,
      terminalDecision: packet.terminalDecisionEvidence ?? null,
      observationCompleted: projection.execution?.observationCompleted ?? null });
  } catch (error) {
    row.status = 'failed'; row.error = String(error).slice(0, 1200); row.fatalEvidenceError = canonicalEvidenceFailure(error, verifying);
  } finally {
    diagnosticsOpen = false;
    if (browser) await browser.close().catch(() => {});
    row.completedAt = new Date().toISOString(); row.mainDocumentResponses = network; row.pageErrors = errors;
    const reasons = navigationFailureReasons(row);
    if (network.some(response => [401, 403, 407, 429, 451, 503].includes(response.status))) reasons.push('main_document_restricted_status');
    if ((row.limitations ?? []).some(value => /captcha|challenge|rate.limit|block_detected|automated.access/i.test(value))) reasons.push('retained_access_restriction');
    if (row.error && /captcha|challenge|rate.limit|blocked|public.network/i.test(row.error)) reasons.push('access_guard_failure');
    if (row.status === 'failed' || network.some(response => response.status >= 400)) reasons.push('failed_or_unreachable_visit');
    row.runtime = { noGoCandidate: reasons.length > 0, noGoReasons: reasons };
    save('result.json', row);
    console.log(JSON.stringify({ url: targetUrl, action, arm, status: row.status, execution: row.execution,
      registration: row.registration?.status, reasons: row.diagnostics?.reasons, noGo: row.runtime.noGoCandidate }));
  }
}
