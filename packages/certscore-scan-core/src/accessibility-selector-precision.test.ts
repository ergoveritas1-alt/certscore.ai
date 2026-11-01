import assert from 'node:assert/strict';
import test from 'node:test';
import type { Result } from 'axe-core';
import { normalizeAccessibilityRule } from './accessibility-audit';

function node(target: unknown) {
  return normalizeAccessibilityRule({id:'label',impact:'serious',tags:['wcag2a'],help:'Label fields',description:'Label fields',
    helpUrl:'https://dequeuniversity.com/rules/axe/4.11/label',nodes:[{target,html:'<input>',any:[],all:[],none:[]}] } as Result).representativeNodes[0]!;
}
test('distinct private attribute values become approximate hints without retaining their values',()=>{
  const a=node(['input[data-kind="private-search"]']),b=node(['input[data-kind="private-contact"]']);
  assert.deepEqual(a.selectors,b.selectors);
  assert.deepEqual(a.selectorRetention,{version:'sanitized_selectors.v1',precision:'approximate'});
  assert.deepEqual(b.selectorRetention,a.selectorRetention);
  assert.doesNotMatch(JSON.stringify([a,b]),/private-search|private-contact/);
});
test('unchanged frame and shadow paths preserve structure without claiming uniqueness',()=>{
  const n=node(['iframe#frame',['#shadow','#field']]);
  assert.deepEqual(n.selectors,['iframe#frame',['#shadow','#field']]);
  assert.deepEqual(n.selectorRetention,{version:'sanitized_selectors.v1',precision:'unchanged'});
});
test('selector string and path truncation cannot look like unchanged precise targets',()=>{
  for(const target of [['#'+'a'.repeat(401)],Array.from({length:9},(_,i)=>`#frame-${i}`),[Array.from({length:9},(_,i)=>`#shadow-${i}`)]]) {
    const n=node(target);assert.equal(n.selectorRetention?.precision,'approximate');
    assert.ok(n.selectors.length<=8);
    assert.ok(n.selectors.every(s=>Array.isArray(s)?s.length<=8&&s.every(p=>p.length<=400):s.length<=400));
  }
});
test('unquoted, operator and escaped bracket attribute values remain private',()=>{
  for (const selector of ['input[data-private=secret]', 'input[data-private^="secret]suffix"]', "input[data-private='secret\\\'suffix']"]) {
    const n=node([selector]);
    assert.doesNotMatch(JSON.stringify(n),/secret|suffix/);
    assert.equal(n.selectorRetention?.precision,'approximate');
  }
});
