import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { REPORT_EVIDENCE_LINK_TARGETS } from '@certscore/api-contracts';
import { findingEvidenceAnchor } from '../../lib/scans/report-evidence-navigation';
import { reportEvidenceIdFromHash } from './evidence-jump-link';
import { EvidenceDirectory } from './report-lab/shadow-scan-report';
import { SHADOW_REPORT } from './report-lab/shadow-report-data';

test('MCP evidence targets stay aligned with the report finding navigation', () => {
  for (const target of REPORT_EVIDENCE_LINK_TARGETS) {
    assert.equal(findingEvidenceAnchor(target.findingId), target.anchor);
    assert.equal(reportEvidenceIdFromHash(`#${target.anchor}`), target.anchor);
  }
  assert.equal(reportEvidenceIdFromHash('#page-event-timeline'), 'page-event-timeline');
  for (const hash of ['#unknown', '#%E0%A4%A', '#__proto__', '#<script>']) assert.equal(reportEvidenceIdFromHash(hash), null);
});

test('retained privacy findings have real evidence anchors inside the report', () => {
  // The design fixture uses historical hyphenated IDs; current projections use canonical checklist IDs.
  const targets = REPORT_EVIDENCE_LINK_TARGETS.filter(target => target.anchor.startsWith('evidence-row-'));
  const rows = targets.map(target => ({ ...SHADOW_REPORT.trackingExternalRows[0]!, id: target.anchor.slice('evidence-row-'.length) }));
  const html = renderToStaticMarkup(<EvidenceDirectory compact report={{ ...SHADOW_REPORT, fullSite: undefined, trackingExternalRows: rows }} />);
  for (const target of targets) assert.ok(html.includes(`id="${target.anchor}"`), target.findingId);
});
