import test from 'node:test';import assert from 'node:assert/strict';
import {resolveCanonicalVendor} from '../../../packages/certscore-vendor-resolver/src/index.ts';
import {readCsv} from './run.ts';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('canonical endpoint attribution is retained; hostname-free unrelated traffic stays unknown',()=>{const a=resolveCanonicalVendor({type:'request',url:'https://www.google-analytics.com/g/collect',evidenceId:'e1'});assert.equal(a.status,'resolved');assert.equal(a.observation?.purpose,'analytics');const b=resolveCanonicalVendor({type:'request',url:'https://fixture.invalid/collect',evidenceId:'e2'});assert.equal(b.status,'unrecognized');});
test('CSV parser preserves quoted values and commas without changing identities',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'gpc-csv-'));try{const p=path.join(d,'x.csv');fs.writeFileSync(p,'id,value\n"a","x,y"\n"b","quote ""kept"""\n');assert.deepEqual(readCsv(p),[{id:'a',value:'x,y'},{id:'b',value:'quote "kept"'}]);}finally{fs.rmSync(d,{recursive:true});}});
