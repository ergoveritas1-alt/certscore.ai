import assert from 'node:assert/strict';
import test from 'node:test';
import {extractCandidates} from './scanners/policy-surface-scanner';

test('an unclosed outer anchor cannot borrow footer policy labels or swallow their destinations',()=>{
  const html=`<a href="/contact">Contact<div>About</div><footer><a href="https://policy.example.test/privacy">Privacy Policy</a><a href="/choices">Your Privacy Choices</a><a href="/california">CA Notice</a><a href="/terms">Terms of Service</a></footer>`;
  const candidates=extractCandidates('https://publisher.example.test/',html,'Contact About Privacy Policy Your Privacy Choices CA Notice Terms of Service');
  assert.ok(candidates.some(row=>row.normalizedUrl==='https://policy.example.test/privacy'&&row.deterministicSurfaceType==='privacy_policy'));
  assert.ok(candidates.some(row=>row.normalizedUrl==='https://publisher.example.test/choices'&&row.deterministicSurfaceType==='your_privacy_choices'));
  assert.ok(candidates.some(row=>row.normalizedUrl==='https://publisher.example.test/california'&&row.deterministicSurfaceType==='california_notice'));
  assert.ok(!candidates.some(row=>row.normalizedUrl==='https://publisher.example.test/contact'));
  assert.ok(candidates.every(row=>!row.linkText.includes('Privacy Policy Your Privacy Choices')));
});
