import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyConsentControlLabel } from './consent-control-label-classifier';
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from './privacy-evidence-locale-registry';
import { SUPPORTED_PRIVACY_EVIDENCE_LOCALES } from './supported-languages';

for (const usage of ['observation', 'action'] as const) {
  test(`${usage}: negation, necessary-only and questions cannot become false choices`, () => {
    const classify = (label: string) => classifyConsentControlLabel({label, usage, hasConsentContext:true});
    assert.equal(classify('I Do Not Accept Cookies').intent, 'reject');
    assert.notEqual(classify('Do not accept all').intent, 'accept');
    const necessary = classify('Nur notwendige Funktionscookies akzeptieren');
    assert.equal(necessary.intent, 'reject');
    assert.equal(necessary.semanticRole, 'necessary_only');
    for (const label of ['Que se passe-t-il si je refuse ?', 'Que se passe-t-il si je refuse',
      'What happens if I reject all', 'Was passiert wenn ich alle akzeptieren',
      'Do not reject all', 'Not only necessary cookies',
      'Accept all and necessary only', 'Nicht accept all', 'No accept all',
      'Accept all — do not use cookies', 'Don’t accept cookies', 'Accept all nicht']) assert.equal(classify(label).intent, 'unknown', label);
    for (const label of ['Accept all', 'Accept non-essential cookies', 'Zustimmen']) {
      assert.equal(classify(label).intent, 'accept', label);
    }
    assert.equal(classify('Reject all non-required').intent, 'reject');
    for (const [locale, accept, reject, conflict] of [
      ['en', 'Accept all non-essential cookies', 'Reject all non-essential cookies', 'Accept all or reject all'],
      ['de', 'Alle nicht notwendigen Cookies akzeptieren', 'Alle nicht notwendigen Cookies ablehnen', 'Alle akzeptieren oder alle ablehnen'],
      ['fr', 'Accepter tous les cookies non essentiels', 'Refuser tous les cookies non essentiels', 'Accepter ou refuser'],
    ] as const) {
      for (const localeHints of [undefined, [locale]] as const) {
        const c = (label: string) => classifyConsentControlLabel({label, usage, hasConsentContext: true, localeHints: localeHints ? [...localeHints] : undefined});
        assert.equal(c(accept).intent, 'accept', accept);
        assert.equal(c(reject).intent, 'reject', reject);
        assert.equal(c(conflict).intent, 'unknown', conflict);
      }
    }
    for (const label of ['Accept all non-essential cookies, do not consent',
      'Do not reject all non-essential cookies', 'Do not accept only necessary cookies',
      'Accept all or I Do Not Accept Cookies', 'Reject all and accept all']) {
      assert.equal(classify(label).intent, 'unknown', label);
    }
    for (const label of ['Accept only necessary cookies', 'Accept only essential cookies']) {
      assert.equal(classify(label).semanticRole, 'necessary_only', label);
    }
    assert.equal(classify('Reject all non-necessary cookies').intent, 'reject');
    assert.equal(classify('Reject all and subscribe').variant, 'reject_with_subscription');
    assert.equal(classify('Reject and Pay').variant, 'reject_with_payment');
    assert.equal(classify('OK').semanticRole, 'ambiguous_acknowledgment');
    assert.equal(classifyConsentControlLabel({label:'Accept all', ariaLabel:'Reject all', usage}).intent,'unknown');
    assert.equal(classifyConsentControlLabel({label:'Reject all', ariaLabel:'Accept all', usage}).intent,'unknown');
    assert.equal(classifyConsentControlLabel({label:'Accept', ariaLabel:'Accept all', usage}).intent,'accept');
    assert.equal(classifyConsentControlLabel({label:'Reject all', ariaLabel:'What happens if I reject all', usage}).intent,'unknown');
  });
  test(`${usage}: every supported locale retains choices and fails closed on qualified labels`, () => {
    assert.equal(PRIVACY_EVIDENCE_LOCALE_REGISTRY.length, SUPPORTED_PRIVACY_EVIDENCE_LOCALES.length);
    for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
      const classify = (label: string) => classifyConsentControlLabel({label, usage, hasConsentContext:true, localeHints:[entry.locale]});
      const accept=entry.consentControls.accept[0]!;
      assert.equal(classify(accept).intent,'accept', entry.locale+' positive');
      assert.equal(classify(entry.consentControls.reject[0]!).intent,'reject',entry.locale+' refusal');
      assert.equal(classify(entry.consentControls.necessaryOnly[0]!).semanticRole,'necessary_only',entry.locale+' necessary');
      for (const [kind, phrases] of Object.entries(entry.consentControls)) {
        for (const phrase of phrases) assert.equal(classify(phrase).intent,
          kind === 'necessaryOnly' ? 'reject' : kind, entry.locale+' '+kind+' '+phrase);
      }
      assert.equal(classify(accept+'？').intent,'unknown',entry.locale+' question');
      // Guard probes are adversarial token compositions, not translated corpus labels.
      const guards=entry.consentLabelGuards!;
      assert.ok(guards.negationTokens.length&&guards.informationalPrefixes.length,entry.locale);
      assert.notEqual(classify(guards.negationTokens[0]+' '+accept).intent,'accept',entry.locale+' negation');
      assert.equal(classify(guards.informationalPrefixes[0]+' '+accept).intent,'unknown',entry.locale+' reference');
    }
  });
}
