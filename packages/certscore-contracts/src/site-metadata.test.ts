import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSiteTechnology, siteMetadataSchema } from './site-metadata';
const base = { contractVersion: 'certscore.site-metadata.v1' as const, title: 'Example', language: 'en', generators: [], wordpressAssetObserved: false };
test('WordPress version requires an explicit declaration, never an asset query version', () => {
  assert.deepEqual(describeSiteTechnology({...base, wordpressAssetObserved: true}), {platform:'WordPress indicators observed',version:'Unknown'});
  assert.equal(describeSiteTechnology({...base,generators:['WordPress 6.8.2']}).version,'6.8.2');
  assert.equal(describeSiteTechnology({...base,generators:['WordPress 6.8.2','WordPress 6.7.1']}).version,'Unknown');
  assert.equal(describeSiteTechnology(base).platform,'Not identified');
  assert.equal(describeSiteTechnology().platform,'Not captured');
  assert.equal(siteMetadataSchema.safeParse({...base,generators:Array(9).fill('WordPress')}).success,false);
});
