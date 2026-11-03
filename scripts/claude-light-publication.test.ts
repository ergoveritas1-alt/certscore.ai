import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { certScoreMcpToolContracts, reportEvidencePageSchema } from '@certscore/api-contracts';
import { lightReviewActions } from '../packages/certscore-mcp/src/light-review-actions.js';
import { buildReportEvidencePage } from '../apps/web/lib/api-v2/report-evidence-page.js';

const pluginRoot = resolve('integrations/claude-code/certscore-mcp-light');
const read = (path: string) => readFileSync(resolve(pluginRoot, path), 'utf8');

test('Claude publication candidate is self-contained and reuses approved metadata and icon bytes', () => {
  const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
  const catalog = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  assert.equal(resolve(catalog.plugins[0].source), pluginRoot);
  assert.equal(manifest.version, '0.2.26');
  assert.equal(manifest.privacyPolicyUrl, 'https://certscore.ai/privacy');
  assert.equal(manifest.documentationUrl, 'https://certscore.ai/developers/mcp');
  assert.equal(manifest.supportUrl, 'https://certscore.ai/contact');
  assert.ok(manifest.icon.startsWith('./'));
  const iconPath = realpathSync(resolve(pluginRoot, manifest.icon));
  assert.ok(iconPath.startsWith(realpathSync(pluginRoot) + sep));
  const icon = readFileSync(iconPath);
  assert.deepEqual(icon, readFileSync('apps/web/public/certscore-mark-dark.png'));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
  const mcp = JSON.parse(read('.mcp.json'));
  assert.deepEqual(Object.values(mcp.mcpServers), [{ type: 'http', url: 'https://mcp.certscore.ai/mcp/light' }]);
  const skill = read('skills/privacy-scan/SKILL.md');
  assert.ok(skill.startsWith('---\nname: privacy-scan\ndescription:'));
  assert.ok(skill.includes(`integrationVersion="${manifest.version}"`));
  assert.ok(read('README.md').includes(`Plugin package version: \`${manifest.version}\``));
  assert.ok(read('LICENSE').length > 0);
});

test('a three-of-five bundle recovers all five unchanged findings through supported retained reads for fresh and reused results', () => {
  const fixture = JSON.parse(readFileSync('packages/certscore-mcp/src/test-fixtures/bundle-budget-core.json', 'utf8'));
  // Clearly synthetic findings on a sanitized retained scan core; no production calls.
  const findings = Array.from({ length: 5 }, (_, i) => ({ type: 'certscore_finding', id: `fixture_finding_${i}`,
    label: `Synthetic finding ${i}`, criticality: 'high', confidence: 'good',
    plainEnglish: 'Retained observation for an offline recovery fixture.' }));
  const report = { findings, coverage: { scope: 'starting_page', limitations: ['Bounded observation'] },
    evidence: { networkRequests: [{ atMs: 100 }], cookieSnapshots: [{ capturedAtMs: 800 }],
      cookieWrites: [], consent: { clickCompleted: true, decisionConfirmed: false } } };
  const original = structuredClone(report);
  const paging = certScoreMcpToolContracts.find(tool => tool.name === 'certscore_get_report_evidence_page')!;
  for (const creationDecision of ['new_scan', 'reused_scan']) {
    const scan = { ...fixture.scan, creationDecision };
    const bundle = { ...scan, reportUrl: scan.links.report, findings: findings.slice(0, 3),
      findingsMetadata: { returned: 3, total: 5, truncated: true },
      mcpMetadata: { canonicalFindingsComplete: false } };
    assert.equal(bundle.findingsMetadata.returned, 3);
    assert.equal(bundle.findingsMetadata.total, 5);
    const action = lightReviewActions(bundle)!.followUp;
    assert.equal(action.createsScan, false);
    assert.equal(action.requiresUserRequest, false);
    assert.equal(action.tool, paging.name);
    const args = z.object(paging.inputSchema).strict().parse(action.arguments);
    assert.deepEqual(args, { scanId: scan.scanId });
    const page = buildReportEvidencePage({ scanId: args.scanId as string, report });
    reportEvidencePageSchema.parse(page);
    assert.equal(page.pagination.complete, true);
    assert.deepEqual(page.entries, [{ path: '', value: original }]);
    assert.equal(page.coverage.observationCompleteness, 'see_report_coverage');
    assert.deepEqual(report, original, 'recovery preserves timings and evidence distinctions');
  }
});
