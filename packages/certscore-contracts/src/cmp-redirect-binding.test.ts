import test from 'node:test';
import assert from 'node:assert/strict';
import {hasBoundCmpPreferenceDocument} from './cmp-audit-evidence';
test('redirect inspection is bound to one verified final document, without broadening historical packets',()=>{
 const packet={targetUrl:'https://example.com/',finalUrl:'https://www.example.com/',documentToken:'loader-final'};
 assert.equal(hasBoundCmpPreferenceDocument(packet),false);
 const bound={...packet,navigationBinding:{policyVersion:'passive_redirect_exact_document.v1',requestedUrl:packet.targetUrl,finalUrl:packet.finalUrl,documentToken:'loader-final',redirectCount:1}};
 assert.equal(hasBoundCmpPreferenceDocument(bound),true);
 for(const change of [{documentToken:'stale'},{requestedUrl:'https://other.test/'},{finalUrl:'https://other.test/'},{redirectCount:9}])assert.equal(hasBoundCmpPreferenceDocument({...bound,navigationBinding:{...bound.navigationBinding,...change}}),false);
 assert.equal(hasBoundCmpPreferenceDocument({...bound,finalUrl:'http://www.example.com/',navigationBinding:{...bound.navigationBinding,finalUrl:'http://www.example.com/'}}),false);
 assert.equal(hasBoundCmpPreferenceDocument({...packet,finalUrl:packet.targetUrl}),true);
});

test('linked read-only proof stays bound to its observed source link and exact same-origin destination',()=>{
 const packet={targetUrl:'https://example.com/',finalUrl:'https://example.com/settings',documentToken:'child',linkedPreferenceNavigation:{policyVersion:'read_only_linked_preferences.v1',sourceUrl:'https://example.com/',sourceDocumentToken:'parent',label:'Privacy Settings',destinationUrl:'https://example.com/settings',documentToken:'child'}};
 assert.equal(hasBoundCmpPreferenceDocument(packet),true);
 for(const change of [{sourceUrl:'https://elsewhere.test/'},{destinationUrl:'https://external.test/settings'},{documentToken:'wrong'},{label:'Sign in'},{destinationUrl:'https://example.com/settings?token=secret'}])assert.equal(hasBoundCmpPreferenceDocument({...packet,linkedPreferenceNavigation:{...packet.linkedPreferenceNavigation,...change}}),false);
 assert.equal(hasBoundCmpPreferenceDocument({...packet,linkedPreferenceNavigation:undefined}),false);
});
