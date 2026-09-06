import assert from 'node:assert/strict';
import test from 'node:test';
import { projectSiteMetadata } from './site-metadata-projection';
import type { CanonicalEvidenceBundle } from '@certscore/contracts';
const url='https://example.com/';
const observation={contractVersion:'certscore.site-metadata.v1',title:'Example',language:'en',generators:['WordPress 6.8.2'],wordpressAssetObserved:true};
const bundle={domSnapshots:[{url,artifactId:'runtime:dom',capturedAtMs:123,documentIdentity:{documentId:'one'},consentStateAtTime:'pre_consent',siteMetadata:observation}]} as unknown as CanonicalEvidenceBundle;
test('metadata persists only from verified document-bound retained evidence',()=>{
 const source={verificationStatus:'verified',sha256:'a'.repeat(64)};
 assert.equal(projectSiteMetadata(bundle,source,url)?.observation.generators[0],'WordPress 6.8.2');
 assert.equal(projectSiteMetadata(bundle,{...source,verificationStatus:'local_unverified'},url),null);
 assert.equal(projectSiteMetadata(bundle,source,'https://other.example/'),null);
 assert.equal(projectSiteMetadata({domSnapshots:[]} as unknown as CanonicalEvidenceBundle,source,url),null);
});
