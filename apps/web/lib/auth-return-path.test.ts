import assert from 'node:assert/strict';
import test from 'node:test';
import {safeAuthReturnPath, authRetryPath} from './auth-return-path';
test('OAuth destination survives sign-in retry without losing PKCE or state',()=>{
 const path='/oauth/authorize?client_id=fixture&state=safe%2Bstate&code_challenge=abc&scope=scan%3Aread%20mcp';
 assert.equal(safeAuthReturnPath(path),path);
 assert.equal(new URL(authRetryPath('google_sign_in_failed',path),'https://certscore.ai').searchParams.get('next'),path);
});
test('auth returns reject cross-origin and backslash/control paths',()=>{
 for(const path of ['https://evil.test','//evil.test','/\\evil.test','/\nevil.test','/.//evil.test#section']) assert.equal(safeAuthReturnPath(path),'/app');
});
test('auth returns preserve a scan review focus and section anchor',()=>{
 const path='/scan/example?reviewFocus=gdpr_eprivacy#gdpr-eprivacy-evidence';
 assert.equal(safeAuthReturnPath(path),path);
});
