import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('publisher',pathlib.Path(__file__).with_name('publish-audit-progress-dashboard.py'));publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
class PublishTests(unittest.TestCase):
    def fixture(self,root,name,through):
        run=root/'runs'/name;run.mkdir(parents=True);cache=run/'cache-manifest.json';cache.write_text(json.dumps({'sourceWrites':0,'counts':{'copied':1},'receipts':[{'state':'copied','freshness':'source_bytes_verified'}]}))
        tool=root/'pinned-tool.ts';tool.write_text('fixed audit source');pins=[{'file':str(tool),'sha256':publisher.digest(tool)}];(root/'progress-dashboard-activation.json').write_text(json.dumps({'toolSources':pins}))
        data={'metricContractVersion':'certscore.audit-metrics.v1','toolSources':pins,'timezone':'America/Los_Angeles','cohort':'Mac mini test fixture','errors':[],'includedRows':1,'windows':[{'end':through}],'sources':[{'file':str(cache),'sha256':publisher.digest(cache)}]}
        (run/'dashboard.json').write_text(json.dumps(data))
        for name in ['dashboard.html','daily-metrics.csv','daily-volumes.csv','daily-findings.csv','metric-contracts.json','exclusions.json']:(run/name).write_text('fixture')
        (run/'dashboard-seal.json').write_text(json.dumps({'files':[{'file':str(run/name),'sha256':publisher.digest(run/name),'bytes':(run/name).stat().st_size} for name in ['dashboard.json','dashboard.html','daily-metrics.csv','daily-volumes.csv','daily-findings.csv','metric-contracts.json','exclusions.json']]}));self.validate(run);return run
    def validate(self,run):
        seal=json.loads((run/'dashboard-seal.json').read_text());(run/'dashboard-validation.json').write_text(json.dumps({'status':'passed','checks':{k:True for k in ['contracts','aggregation','csvParity','sourceBoundaries','focusedTests','desktop','mobile','filters','chartTooltips']},'snapshotHashes':{pathlib.Path(r['file']).name:r['sha256'] for r in seal['files']}}))
    def test_missing_semantic_validation_and_changed_pins_cannot_publish(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);a=self.fixture(root,'first','2026-10-27T12:00:00Z');(a/'dashboard-validation.json').unlink()
            with self.assertRaises(FileNotFoundError):publisher.publish(a,root)
            self.validate(a);(root/'pinned-tool.ts').write_text('changed')
            with self.assertRaisesRegex(ValueError,'Pinned audit source'):publisher.publish(a,root)
    def test_verified_newer_snapshot_updates_latest_and_keeps_old_bytes(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);a=self.fixture(root,'first','2026-10-26T12:00:00Z');publisher.publish(a,root);old=(a/'dashboard.html').read_bytes();b=self.fixture(root,'second','2026-10-27T12:00:00Z');publisher.publish(b,root)
            self.assertEqual((root/'latest').resolve(),b.resolve());self.assertEqual((a/'dashboard.html').read_bytes(),old);self.assertEqual(publisher.publish(b,root)['runId'],'second')
    def test_tampered_output_and_stale_snapshot_cannot_replace_latest(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);a=self.fixture(root,'first','2026-10-27T12:00:00Z');publisher.publish(a,root);b=self.fixture(root,'old','2026-10-26T12:00:00Z')
            with self.assertRaisesRegex(ValueError,'newer snapshot'):publisher.publish(b,root)
            c=self.fixture(root,'bad','2026-10-28T12:00:00Z');(c/'dashboard.html').write_text('tampered')
            with self.assertRaisesRegex(ValueError,'hash/size'):publisher.publish(c,root)
            self.assertEqual((root/'latest').resolve(),a.resolve())
    def test_unverified_cache_freshness_cannot_publish(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);a=self.fixture(root,'first','2026-10-27T12:00:00Z');cache=a/'cache-manifest.json';value=json.loads(cache.read_text());value['receipts'][0]['freshness']='unknown';cache.write_text(json.dumps(value));d=json.loads((a/'dashboard.json').read_text());d['sources'][0]['sha256']=publisher.digest(cache);(a/'dashboard.json').write_text(json.dumps(d));seal=json.loads((a/'dashboard-seal.json').read_text());seal['files'][0].update(sha256=publisher.digest(a/'dashboard.json'),bytes=(a/'dashboard.json').stat().st_size);(a/'dashboard-seal.json').write_text(json.dumps(seal));self.validate(a)
            with self.assertRaisesRegex(ValueError,'freshness'):publisher.publish(a,root)
if __name__=='__main__':unittest.main()
