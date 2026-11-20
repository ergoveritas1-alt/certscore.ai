import test from 'node:test';
import assert from 'node:assert/strict';
import {boundOptOutControlFromAttributes,explicitOptOutEntranceName,namesOptOutSettingsEntrance,optOutSettingsNoticeSentence} from './explicit-opt-out-control';
import {consentAccessibilityDomBindingSchema} from './consent-accessibility-dom-binding';
import {conditionalOptOutDecisionSchema,retainedConditionalOptOutDecision} from './conditional-opt-out-decision';

test('reviewed suffixes preserve explicit meaning without stripping arbitrary text',()=>{
 assert.equal(explicitOptOutEntranceName('Your Privacy Choices, Opens the preference center dialog'),'your privacy choices');
 for(const label of ['Your Privacy Choices, accept all','Do Not Sell My Personal Information except partners','Cookie Settings, Opens preference center dialog'])assert.equal(explicitOptOutEntranceName(label),undefined);
});
test('native locator proof retains only reviewed attributes and an inert anchor route',()=>{
 const attrs=['class','footer ot-sdk-show-settings','href','#','value','secret-value'];
 const value=boundOptOutControlFromAttributes('a',attrs,'Your Privacy Choices');assert.ok(value);
 assert.doesNotMatch(JSON.stringify(value),/secret-value|footer/);
 for(const extra of [['target',''],['download',''],['form','id']])assert.equal(boundOptOutControlFromAttributes('a',[...attrs,...extra],'Your Privacy Choices'),undefined);
 for(const href of ['https://example.com/','#privacy','javascript:void(0)',''])assert.equal(boundOptOutControlFromAttributes('a',['class','ot-sdk-show-settings','href',href],'Your Privacy Choices'),undefined);
 assert.equal(boundOptOutControlFromAttributes('a',['class','not-ot-sdk-show-settings','href','#'],'Your Privacy Choices'),undefined);
 const base={version:'ax_backend_dom_binding.v1',axNodeId:'1',backendNodeId:1,nodeType:1,tagName:'a',documentUrl:'https://example.com/',documentIdentity:{source:'cdp_loader_id',token:'doc'}};
 assert.equal(consentAccessibilityDomBindingSchema.safeParse({...base,optOutControl:value}).success,false);
 assert.equal(consentAccessibilityDomBindingSchema.safeParse({...base,version:'ax_backend_dom_binding.v2',optOutControl:value}).success,true);
});
test('conditional funnel requires scan-bound terminal dispatch and sufficient recorded time',()=>{
 const decision={version:'conditional_opt_out_dispatch.v2',scanId:'scan',status:'dispatched',reason:'supported_control',sourceSha256:'a'.repeat(64),observationId:'control',recipeVersion:'recipe',controlObserved:true,supportedRoute:true,remainingTimeMs:5000,decidedAtMs:10000};
 const lane={status:'limited',startedAt:'2026-11-05T00:00:00.000Z',completedAt:'2026-11-05T00:00:01.000Z'};
 const manifest={privacyCaptureProfile:'conditional_opt_out_seven_workers.v1',conditionalOptOutDecision:decision};
 assert.ok(retainedConditionalOptOutDecision(manifest,'scan',lane));
 assert.equal(retainedConditionalOptOutDecision(manifest,'other',lane),undefined);
 assert.equal(retainedConditionalOptOutDecision(manifest,'scan',undefined),undefined);
 assert.equal(conditionalOptOutDecisionSchema.safeParse({...decision,remainingTimeMs:4999}).success,false);
 assert.equal(conditionalOptOutDecisionSchema.safeParse({...decision,sourceSha256:undefined}).success,false);
});


test('v3 source presence needs an original observation reference without authorizing a route',()=>{
 const value={version:'conditional_opt_out_dispatch.v3',scanId:'scan',status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),controlObserved:true,observationId:'control',supportedRoute:false};
 assert.equal(conditionalOptOutDecisionSchema.safeParse(value).success,true);
 assert.equal(conditionalOptOutDecisionSchema.safeParse({...value,observationId:undefined}).success,false);
 assert.equal(conditionalOptOutDecisionSchema.safeParse({...value,status:'dispatched',remainingTimeMs:5000}).success,false);
 assert.equal(conditionalOptOutDecisionSchema.safeParse({...value,version:'conditional_opt_out_dispatch.v2',observationId:undefined}).success,true);
});

test('a combined sale/settings entrance can be observed without granting an action recipe', () => {
  const label = 'Do Not Sell My Personal Information / Customize Settings';
  const aria = label + ', Opens the preference center dialog';
  assert.ok(namesOptOutSettingsEntrance(label, aria));
  assert.equal(explicitOptOutEntranceName(label), undefined);
  assert.equal(boundOptOutControlFromAttributes('button', ['id', 'onetrust-pc-btn-handler'], aria), undefined);
  for (const [visible, accessible] of [
    [label, 'Accept All Cookies'],
    [label, aria + ' and accepts optional cookies'],
    ['Customize Settings', 'Customize Settings, Opens preference center dialog'],
    ['Opt out of newsletters', 'Opt out of newsletters, Opens preference center dialog'],
    ['Utiq jetzt ablehnen', 'Utiq jetzt ablehnen, Opens preference center dialog'],
    ['Learn more about ' + label, 'Learn more about ' + aria],
    ['Your Privacy Choices / Accept all', 'Your Privacy Choices / Accept all, Opens preference center dialog'],
  ]) {
    assert.equal(namesOptOutSettingsEntrance(visible, accessible), false, accessible);
  }
});

test("a settings notice requires an affirmative instruction for the quoted opt-out label", () => {
  const label = "Your Privacy Choices";
  const sentence = 'Click on "Your Privacy Choices" to customize your preferences.';
  assert.equal(optOutSettingsNoticeSentence(label, "We use cookies. " + sentence), sentence);
  for (const notice of [
    'Do not click on "Your Privacy Choices" to customize your preferences.',
    'Click on "Cookie Settings" to customize your preferences. Your Privacy Choices.',
    'Click on "Your Privacy Choices" to customize your newsletter preferences.',
    'Click on "Your Privacy Choices" to customize your preferences or opt in to advertising.',
    'Our policy explains how to customize your preferences.',
    sentence.repeat(31),
  ]) assert.equal(optOutSettingsNoticeSentence(label, notice), undefined);
  assert.equal(optOutSettingsNoticeSentence("Cookie Settings", 'Click on "Cookie Settings" to customize your preferences.'), undefined);
  assert.equal(explicitOptOutEntranceName(sentence), undefined);
});
