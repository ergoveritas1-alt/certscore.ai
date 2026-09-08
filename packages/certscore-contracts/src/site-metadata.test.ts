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

test('common CMS versions require explicit, consistent declarations', () => {
  for (const generator of ['Drupal 11.2.0', 'Joomla! 5.3.2', 'Ghost 6.0.1', 'TYPO3 13.4.0']) {
    assert.notEqual(describeSiteTechnology({...base, generators:[generator]}).version, 'Unknown');
  }
  assert.equal(describeSiteTechnology({...base, generators:['Wix.com Website Builder']}).platform, 'Wix (declared)');
  assert.equal(describeSiteTechnology({...base, generators:['Shopify']}).version, 'Unknown');
  assert.equal(describeSiteTechnology({...base, generators:['Drupal 11.2.0', 'Drupal 10.5.0']}).version, 'Unknown');
  assert.equal(describeSiteTechnology({...base, generators:['Ghost 6.0.1', 'Ghost']}).version, 'Unknown');
});

test('Hugo declaration separates generator and version', () => {
  assert.deepEqual(describeSiteTechnology({...base, generators:['Hugo 0.119.0']}), {
    platform: 'Hugo (declared)', version: '0.119.0',
  });
});
