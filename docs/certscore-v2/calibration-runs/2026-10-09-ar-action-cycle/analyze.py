import collections, datetime, hashlib, json, pathlib, statistics

root = pathlib.Path.cwd()
base = root / 'artifacts/ar-action-cycle-20261009'
out = root / 'docs/certscore-v2/calibration-runs/2026-10-09-ar-action-cycle'
read = lambda p: json.loads(p.read_text())
summary = read(base / 'summary.json')
assert len(summary['visits']) == 12 and all(v.get('completedAt') for v in summary['visits'])
assert all(v['status'] == 'completed' and not v.get('noGo') for v in summary['visits'])
rows, contacts = [], []
for v in summary['visits']:
    packet_root = (root / v['resultPath']).parent
    result = read(root / v['resultPath'])
    for lane in result['lanes']:
        contacts.append({k: lane[k] for k in ['url', 'scanId', 'startedAt', 'completedAt', 'scannerRuntimeStarted', 'status', 'lane']})
        row = {k: v[k] for k in ['url', 'version', 'repeat']}
        row.update({k: lane.get(k) for k in ['lane', 'durationMs', 'click', 'registration', 'navigation', 'limitations']})
        if lane['lane'] != 'consent':
            name = 'PostAcceptEvidencePacket.json' if lane['lane'] == 'accept' else 'PostRefusalEvidencePacket.json'
            packet = read(packet_root / lane['lane'] / name)
            proof = packet.get('actionControlProof') or {}
            row['proofValid'] = bool(proof.get('action') == lane['lane'] and proof.get('authorizedTargetSha256') == packet.get('exactTargetSha256') and proof.get('visible') and proof.get('enabled') and proof.get('uniquelyActionable'))
            row['afterActionCapture'] = packet.get('afterActionCapture')
            row['packet'] = str((packet_root / lane['lane'] / name).relative_to(root))
        rows.append(row)
for path in sorted((base / 'probe').glob('*/result.json')):
    for lane in read(path)['lanes']:
        contacts.append({k: lane[k] for k in ['url', 'scanId', 'startedAt', 'completedAt', 'scannerRuntimeStarted', 'status', 'lane']})
assert len(contacts) == 42
metrics = {}
for version in ['baseline', 'candidate']:
    selected = [r for r in rows if r['version'] == version]
    metrics[version] = {}
    for action in ['accept', 'reject']:
        rs = [r for r in selected if r['lane'] == action]
        metrics[version][action] = {
            'sessions': len(rs), 'completedClicks': sum(r['click']['outcome'] == 'completed' for r in rs),
            'verifiedClickProofs': sum(r['proofValid'] for r in rs),
            'confirmed': sum(r['registration']['status'] == 'confirmed' for r in rs),
            'unconfirmedClicked': sum(r['click']['outcome'] == 'completed' and r['registration']['status'] == 'unconfirmed' for r in rs),
        }
timing = {}
for host in ['nature.org', 'unleashedsoftware.com', 'gotokyo.org']:
    timing[host] = {}
    for version in ['baseline', 'candidate']:
        timing[host][version] = {}
        for action in ['accept', 'reject']:
            values = [r['durationMs'] for r in rows if r['url'] == 'https://' + host + '/' and r['version'] == version and r['lane'] == action]
            timing[host][version][action] = {'samplesMs': values, 'medianMs': statistics.median(values)}
# Confirm measured candidate bytes did not change while the batch ran.
manifests = read(base / 'source-manifests.json')
for relative, expected in manifests['after']['files'].items():
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative
out.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
all_contacts = {'runKey': 'ar-action-cycle-20261009', 'generatedAt': now, 'results': contacts}
(base / 'all-contacts-summary.json').write_text(json.dumps(all_contacts, indent=2) + '\n')
results = {
    'runKey': all_contacts['runKey'], 'generatedAt': now, 'localOnly': True, 'deployed': False,
    'protocol': summary['protocol'], 'visits': 12, 'benchmarkSessions': 36, 'diagnosticSessions': 6,
    'totalContactSessions': 42, 'metrics': metrics, 'timing': timing, 'actionsAndVisits': rows,
    'sourceHashes': {k: {a: b for a, b in value.items() if a != 'files'} for k, value in manifests.items() if isinstance(value, dict)},
    'limitations': [
        'Three selected diagnostic sites with correlated repeats; not a production reliability or defect-rate estimate.',
        'Legacy Reject ignored the harness 30-second result budget. Candidate honors it. Timing reflects corrected bounding, not successful GoTokyo interaction.',
        'Local macOS navigation can use the existing headed fallback; AWS Lambda does not use that fallback. Do not extrapolate the measured savings to production.',
        'Nature incomplete category coverage remains semantically unconfirmed; no missing category was inferred.',
        'The six instrumented existing-action diagnostic sessions are excluded from paired metrics.',
        'No new necessary-only or Portuguese Reject click eligibility was enabled; pending cost approval.',
    ],
}
(out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
for name in ['run.mts', 'analyze.py', 'selection.json', 'inventory-manifest.json', 'all-contacts-summary.json', 'source-manifests.json', 'registry.log', 'contact-export.log', 'focused-fixtures.log', 'action-regressions.log', 'typecheck.log', 'probe-nature.log', 'probe-nature-2.log', 'probe-sodexo.log']:
    (out / name).write_bytes((base / name).read_bytes())
print(json.dumps({'metrics': metrics, 'timing': timing}, indent=2))
