"""Offline cache checks; temporary fixture files only."""
import hashlib,json,pathlib,subprocess,tempfile,unittest,importlib.util,os
from unittest import mock
SCRIPT=pathlib.Path(__file__).with_name('cache-mac-mini-evidence.py')
class CacheTests(unittest.TestCase):
    def test_completed_history_uses_local_bytes_and_explicit_pending_id_can_refresh(self):
        spec=importlib.util.spec_from_file_location('cache',SCRIPT);cache=importlib.util.module_from_spec(spec);spec.loader.exec_module(cache)
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source=root/'source';(source/'evidence').mkdir(parents=True);id='11111111-1111-4111-8111-111111111111';src=source/'evidence'/(id+'.json')
            value={'scanId':id,'timestamps':{'createdAt':'2026-10-20T00:00:00Z'},'scanStatus':'completed'};src.write_text(json.dumps(value));start=cache.utc('2026-09-27T07:00:00Z');end=cache.utc('2026-10-27T10:30:00Z');cache.copy_exports(source,root/'first',start,end)
            value['laterField']='new';src.write_text(json.dumps(value));original_read=pathlib.Path.read_bytes
            def guarded(p):
                if p==src:raise AssertionError('Historical source must not be downloaded again')
                return original_read(p)
            with mock.patch.object(pathlib.Path,'read_bytes',guarded):cache.copy_exports(source,root/'second',start,end,root/'first')
            self.assertNotIn('laterField',json.loads((root/'second/evidence'/src.name).read_text()))
            receipt=json.loads((root/'second/cache-manifest.json').read_text())['receipts'][0];self.assertEqual(receipt['freshness'],'historical_cache_verified')
            cache.copy_exports(source,root/'third',start,end,root/'second',[id]);self.assertEqual(json.loads((root/'third/evidence'/src.name).read_text())['laterField'],'new')
    def test_recent_completed_export_is_still_checked_for_updates(self):
        spec=importlib.util.spec_from_file_location('cache',SCRIPT);cache=importlib.util.module_from_spec(spec);spec.loader.exec_module(cache)
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source=root/'source';(source/'evidence').mkdir(parents=True);id='11111111-1111-4111-8111-111111111111';src=source/'evidence'/(id+'.json');value={'scanId':id,'timestamps':{'createdAt':'2026-10-26T00:00:00Z'},'scanStatus':'completed'};src.write_text(json.dumps(value));start=cache.utc('2026-09-27T07:00:00Z');end=cache.utc('2026-10-27T10:30:00Z');cache.copy_exports(source,root/'first',start,end)
            value['laterField']='new';src.write_text(json.dumps(value));cache.copy_exports(source,root/'second',start,end,root/'first');self.assertEqual(json.loads((root/'second/evidence'/src.name).read_text())['laterField'],'new')
    def test_live_directory_repeating_a_name_does_not_duplicate_a_scan(self):
        spec=importlib.util.spec_from_file_location('cache',SCRIPT);cache=importlib.util.module_from_spec(spec);spec.loader.exec_module(cache)
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source=root/'source';(source/'evidence').mkdir(parents=True);id='11111111-1111-4111-8111-111111111111'
            (source/'evidence'/(id+'.json')).write_text(json.dumps({'scanId':id,'timestamps':{'createdAt':'2026-10-20T00:00:00Z'}}))
            with os.scandir(source/'evidence') as entries:entry=next(entries)
            class Repeated:
                def __enter__(self):return iter([entry,entry])
                def __exit__(self,*args):return False
            with mock.patch.object(cache.os,'scandir',return_value=Repeated()):cache.copy_exports(source,root/'cache',cache.utc('2026-09-27T07:00:00Z'),cache.utc('2026-10-27T10:30:00Z'))
            manifest=json.loads((root/'cache/cache-manifest.json').read_text());self.assertEqual(manifest['counts'],{'copied':1});self.assertEqual(manifest['discovery']['duplicateNamesIgnored'],1)
    def test_dates_source_immutability_sealed_manifest_and_reuse(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source=root/'source';(source/'evidence').mkdir(parents=True)
            ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']
            for id,at in zip(ids,['2026-10-20T00:00:00Z','2026-09-01T00:00:00Z',None]):
                (source/'evidence'/(id+'.json')).write_text(json.dumps({'scanId':id,'timestamps':{'createdAt':at},'domain':'example.com'}))
            before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (source/'evidence').iterdir()}
            args=['python3',str(SCRIPT),'--source',str(source),'--out',str(root/'cache'),'--start','2026-09-27T07:00:00Z','--end','2026-10-27T10:30:00Z','--exports-only']
            subprocess.run(args,check=True,capture_output=True)
            manifest=json.loads((root/'cache'/'cache-manifest.json').read_text())
            self.assertEqual(manifest['counts'],{'copied':1,'outside_scan_window':1,'scan_date_unavailable':1})
            self.assertEqual(before,{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (source/'evidence').iterdir()})
            self.assertNotEqual(subprocess.run(args,capture_output=True).returncode,0)
            args[args.index(str(root/'cache'))]=str(root/'cache2')
            subprocess.run(args+['--reuse',str(root/'cache')],check=True,capture_output=True)
            self.assertEqual((root/'cache'/'evidence'/(ids[0]+'.json')).stat().st_ino,(root/'cache2'/'evidence'/(ids[0]+'.json')).stat().st_ino)
    def test_rejects_excessive_window_before_source_access(self):
        with tempfile.TemporaryDirectory() as t:
            result=subprocess.run(['python3',str(SCRIPT),'--source',t,'--out',str(pathlib.Path(t)/'out'),'--start','2026-08-01T00:00:00Z','--end','2026-10-27T00:00:00Z'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertIn('bounded one-month window',result.stderr)
    def test_reused_cache_refreshes_changed_source_without_changing_prior_cache(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source=root/'source';(source/'evidence').mkdir(parents=True)
            id='11111111-1111-4111-8111-111111111111';src=source/'evidence'/(id+'.json')
            value={'scanId':id,'timestamps':{'createdAt':'2026-10-20T00:00:00Z'},'domain':'example.com','scanStatus':'running'};src.write_text(json.dumps(value))
            args=['python3',str(SCRIPT),'--source',str(source),'--out',str(root/'first'),'--start','2026-09-27T07:00:00Z','--end','2026-10-27T10:30:00Z','--exports-only']
            subprocess.run(args,check=True,capture_output=True);old=(root/'first'/'evidence'/src.name).read_bytes()
            value['scanStatus']='completed_limited';src.write_text(json.dumps(value));args[args.index(str(root/'first'))]=str(root/'second')
            subprocess.run(args+['--reuse',str(root/'first')],check=True,capture_output=True)
            self.assertEqual((root/'first'/'evidence'/src.name).read_bytes(),old)
            self.assertEqual(json.loads((root/'second'/'evidence'/src.name).read_text())['scanStatus'],'completed_limited')
            receipt=json.loads((root/'second'/'cache-manifest.json').read_text())['receipts'][0]
            self.assertEqual(receipt['freshness'],'source_bytes_verified');self.assertFalse(receipt['cacheBytesReused'])
if __name__=='__main__':unittest.main()
