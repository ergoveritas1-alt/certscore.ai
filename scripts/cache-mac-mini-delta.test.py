"""Offline checks for exact-ID cache acquisition; no cloud or product tests."""
import hashlib, importlib.util, json, pathlib, tempfile, unittest
from unittest import mock

spec=importlib.util.spec_from_file_location('delta',pathlib.Path(__file__).with_name('cache-mac-mini-delta.py'))
delta=importlib.util.module_from_spec(spec);spec.loader.exec_module(delta)
ID='11111111-1111-4111-8111-111111111111'
NEW='22222222-2222-4222-8222-222222222222'

class DeltaTests(unittest.TestCase):
    def fixture(self,root,rows):
        root=root.resolve()
        source=root/'source';(source/'evidence').mkdir(parents=True);prior=root/'prior';(prior/'evidence').mkdir(parents=True)
        value={'scanId':ID,'timestamps':{'createdAt':'2026-10-26T12:00:00Z'},'scanStatus':'completed','meta':{'reportProjectionSourceHash':'a'*64}}
        b=json.dumps(value).encode();p=prior/'evidence'/(ID+'.json');p.write_bytes(b)
        receipt={'scanId':ID,'state':'copied','file':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'scanCreatedAt':'2026-10-26T12:00:00+00:00','scanStatus':'completed','sourceStat':{'sizeBytes':0,'mtimeNs':0,'ctimeNs':0}}
        (prior/'cache-manifest.json').write_text(json.dumps({'end':'2026-10-27T14:00:00+00:00','receipts':[receipt]}))
        inv=root/'inventory.json';inv.write_text(json.dumps({'version':'certscore.mac-mini-direct-id-inventory.v1','readOnly':True,'start':'2026-10-25T14:00:00+00:00','end':'2026-10-28T14:00:00+00:00','rows':rows}))
        return source,prior,inv
    def row(self,id=ID,**kw):
        return {'scanId':id,'isMacMini':True,'isCanary':False,'created_at':'2026-10-26T12:00:00+00:00','updated_at':'2026-10-26T13:00:00+00:00','projection_source_hash':'a'*64,**kw}
    def run_refresh(self,root,source,prior,inv):
        with mock.patch.object(delta.os,'scandir',side_effect=AssertionError('Directory enumeration forbidden')):
            result=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(result['counts'].get('invalid',0),0,result['receipts'])
            return result
    def test_generation_stable_cached_file_needs_no_remote_metadata_or_content(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row()])
            original=pathlib.Path.stat
            def stat(p,*a,**kw):
                if str(p).startswith(str(source)):raise AssertionError('Remote stat forbidden for unchanged generation')
                return original(p,*a,**kw)
            with mock.patch.object(pathlib.Path,'stat',stat):m=self.run_refresh(root,source,prior,inv)
            self.assertEqual(m['transferCounts']['remoteExportReads'],0);self.assertEqual(m['transferCounts']['localFilesReused'],1)
    def test_new_and_changed_files_are_the_only_export_reads(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(updated_at='2026-10-28T12:00:00Z'),self.row(NEW)])
            for id in [ID,NEW]:(source/'evidence'/(id+'.json')).write_text(json.dumps({'scanId':id,'scanStatus':'completed','timestamps':{'createdAt':'2026-10-26T12:00:00Z'},'changed':True}))
            original=(prior/'evidence'/(ID+'.json')).read_bytes();m=self.run_refresh(root,source,prior,inv)
            self.assertEqual(m['transferCounts']['newFiles'],1);self.assertEqual(m['transferCounts']['changedFiles'],1);self.assertEqual(m['transferCounts']['remoteExportReads'],2)
            self.assertEqual((prior/'evidence'/(ID+'.json')).read_bytes(),original)
    def test_missing_file_and_canary_remain_explicit_without_fabrication(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(NEW)])
            m=self.run_refresh(root,source,prior,inv);self.assertEqual(m['counts']['source_unavailable'],1);self.assertFalse((root/'out/evidence'/(NEW+'.json')).exists())
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(NEW,isCanary=True)])
            m=self.run_refresh(root,source,prior,inv);self.assertEqual(m['counts']['excluded_canary_or_test'],1)
    def test_duplicate_or_unverified_ids_fail_before_source_access(self):
        for rows in [[self.row(),self.row()],[self.row(isMacMini=False)]]:
            with tempfile.TemporaryDirectory() as t:
                root=pathlib.Path(t);source,prior,inv=self.fixture(root,rows)
                with self.assertRaises(ValueError):self.run_refresh(root,source,prior,inv)
    def test_public_millisecond_timestamp_matches_database_microseconds(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(created_at='2026-10-26T12:00:00.000388+00:00')])
            self.run_refresh(root,source,prior,inv)
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(created_at='2026-10-26T12:00:00.001388+00:00')])
            m=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(m['counts']['invalid'],1)
    def test_missing_previously_cached_bytes_block_instead_of_disappearing(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row()]);(prior/'evidence'/(ID+'.json')).unlink()
            m=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(m['counts']['invalid'],1)

if __name__=='__main__':unittest.main()
