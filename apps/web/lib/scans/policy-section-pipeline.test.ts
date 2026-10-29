import assert from "node:assert/strict";
import test from "node:test";
import { extractPolicySections, retainedPolicySectionsForObservation, gdprTransparencyTopicCandidatesFromRetainedPolicySections } from "../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import { adaptGdprTransparencyTopicCandidatesForProduction } from "./gdpr-transparency-topic-evidence-adapter";
import { GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE } from "./gdpr-transparency-production-profile";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";

test("section disclosures reach the canonical observed-only checklist with ownership gating", () => {
  const sourceUrl = "https://example.test/privacy";
  const repeated = Array.from({ length: 85 }, (_, index) => `<h2>Service purpose ${index}</h2><p>We process your personal data to provide our services and respond to your requests. Our legal basis for processing personal data is consent and legitimate interests in operating our services.</p>`).join("");
  const html = repeated + `<h2>Controller contact</h2><p>The data controller is Example Limited. You can contact us about the processing of your personal data at privacy@example.test, or by mail at 123 Example Street, London.</p>
    <h2>Data protection officer</h2><p>Our data protection officer can be contacted at dpo@example.test about questions concerning the processing of your personal data and your privacy rights.</p>
    <h2>International transfers</h2><p>We transfer your personal data outside the European Economic Area to service providers in the United States. We use standard contractual clauses to protect your personal data.</p>
    <h2>Your privacy rights</h2><p>You have the right to access, rectify, erase and restrict processing of your personal data. You may also object to processing and request data portability by contacting privacy@example.test.</p>
    <h2>Recipients and service providers</h2><p>Personal data may be disclosed only as needed to professional advisers, public authorities or courts where disclosure is lawfully required or necessary to establish, exercise or defend legal claims.</p>
    <h2>Retention</h2><table><tr><th>Record</th><th>Typical retention</th></tr><tr><td>Consent choice</td><td>Up to 180 days, plus only what is reasonably necessary to demonstrate compliance</td></tr></table>
    <h2>Complaints</h2><p>You may complain to the Garante per la protezione dei dati personali in Italy or the competent supervisory authority where you live, work or where the alleged issue occurred.</p>
    <h2>Automated analysis and human review</h2><p>Example is not intended to make decisions about natural persons based solely on automated processing that produce legal or similarly significant effects within Article 22 GDPR.</p>`;
  const sections = retainedPolicySectionsForObservation(extractPolicySections({ html, visibleText: html.replace(/<[^>]+>/g, " "), sourceUrl }));
  assert.ok(sections.length <= 24);
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
  const surface = { gdprTransparencyTopicCandidates: candidates, normalizedUrl: sourceUrl, url: sourceUrl, status: "fetched" as const, surfaceType: "privacy_policy" as const };
  const input = { surface, policyTextQuality: { usable: true }, profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE };
  assert.deepEqual(adaptGdprTransparencyTopicCandidatesForProduction({ ...input, isTargetRelevantPrivacyPolicy: false }).acceptedProductionSignals, []);
  const adaptation = adaptGdprTransparencyTopicCandidatesForProduction({ ...input, isTargetRelevantPrivacyPolicy: true });
  const expected = ["controller_contact", "dpo_contact", "processing_purposes", "legal_basis", "international_transfers", "data_subject_rights", "recipients_or_vendor_categories", "data_retention", "supervisory_authority", "automated_decision_making_or_profiling"];
  for (const topic of expected) assert.ok(adaptation.acceptedProductionSignals.some((signal) => signal.disclosureType === topic), JSON.stringify(adaptation.dispositions));
  const runtimeArtifacts = { policyDisclosureSummary: {
    article13DisclosureSignals: adaptation.acceptedProductionSignals,
    gdprTransparencyEvidenceProfile: adaptation.profile,
    gdprTransparencyProductionEvidenceEnabled: adaptation.productionEvidenceEnabled,
  } };
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  for (const topic of expected) assert.ok(normalizedConcerns.some((concern) => concern.originKey === `gdpr_transparency.article13.${topic}`));
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, events: [], normalizedConcerns, runtimeArtifacts, scanCompleted: true, snapshot: {} });
  const rows = deriveGdprEprivacyCoverageChecklist({ coverageLimited: false, coverageOutcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true });
  for (const id of ["controller_contact_disclosure", "dpo_contact_point_disclosure", "processing_purposes_disclosure", "legal_basis_disclosure_observed", "international_transfers_disclosure", "data_subject_rights_disclosure", "recipients_vendor_categories_disclosure", "retention_disclosure_observed", "supervisory_authority_complaint_disclosure", "automated_decision_making_profiling_disclosure"]) {
    const row = rows.find((row) => row.id === id);
    assert.equal(row?.evidenceState, "observed", `${id}: ${JSON.stringify(row)}`);
  }
});

test("encoded German controller retention and complaint disclosures pass canonical production gates", () => {
  const sourceUrl = "https://example.test/datenschutz";
  const html = `<h2>Hinweis zur verantwortlichen Stelle</h2><p>Die verantwortliche Stelle f&uuml;r die Datenverarbeitung auf dieser Website ist: Beispiel GmbH, Hauptstra&szlig;e 1. Telefon: 12345. datenschutz@example.test</p>
    <h2>Speicherdauer</h2><p>Soweit keine speziellere Speicherdauer genannt wurde, verbleiben Ihre personenbezogenen Daten bei uns, bis der Zweck f&uuml;r die Datenverarbeitung entf&auml;llt.</p>
    <h2>Beschwerderecht bei der zust&auml;ndigen Aufsichtsbeh&ouml;rde</h2><p>Im Falle von Verst&ouml;&szlig;en gegen die DSGVO steht den Betroffenen ein Beschwerderecht bei einer Aufsichtsbeh&ouml;rde, insbesondere in dem Mitgliedstaat ihres gew&ouml;hnlichen Aufenthalts zu.</p>`;
  const sections = extractPolicySections({ html, visibleText: html.replace(/<[^>]+>/g, " "), sourceUrl });
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: { gdprTransparencyTopicCandidates: candidates, normalizedUrl: sourceUrl, url: sourceUrl, status: "fetched", surfaceType: "privacy_policy" },
  });
  for (const topic of ["controller_contact", "data_retention", "supervisory_authority"]) {
    const signal = result.acceptedProductionSignals.find((signal) => signal.disclosureType === topic);
    assert.ok(signal, JSON.stringify(result.dispositions));
    assert.doesNotMatch(signal.evidenceText, /&(?:uuml|szlig|auml|ouml);/);
    assert.equal(signal.status, "observed");
  }
});


test("a retained role-only purpose citation cannot become an Observed canonical checklist row", () => {
  const quote = "Our customer decides how that data is used, and our Data Processing Addendum governs how we handle it. If you subscribed to a company's status page, or you're on a customer's team, that company's privacy policy applies, and you should contact them first to exercise your rights.";
  const runtimeArtifacts = { policyDisclosureSummary: { article13DisclosureSignals: [{ disclosureType: "processing_purposes", status: "observed", confidence: .9,
    source: "deterministic", evidenceText: quote, selectedPolicySectionExcerpt: quote,
    selectedPolicySectionUrl: "https://example.test/privacy", selectedEvidenceStrength: "strong" }],
    gdprTransparencyEvidenceProfile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE, gdprTransparencyProductionEvidenceEnabled: true } };
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, events: [], normalizedConcerns, runtimeArtifacts, scanCompleted: true, snapshot: {} });
  const rows = deriveGdprEprivacyCoverageChecklist({ coverageLimited: false, coverageOutcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true });
  assert.notEqual(rows.find(row => row.id === "processing_purposes_disclosure")?.evidenceState, "observed");
});

test("explicit German website joint controllers reach the canonical checklist without bypassing source ownership", () => {
  const sourceUrl="https://example.test/datenschutz";
  const text="Datenschutzerklärung. Gemeinsam Verantwortliche für den Betrieb dieser Internetseite im Sinne der Europäischen Datenschutz-Grundverordnung (DSGVO) und zugleich Diensteanbieter sind: 1. Beispiel Zeitung GmbH & Co. KG, Breiter Gang 10, 49074 Osnabrück. E-Mail: info@example.test.";
  const sections=extractPolicySections({html:"",visibleText:text,sourceUrl});
  const input={policyTextQuality:{usable:true},profile:GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,surface:{surfaceType:"privacy_policy" as const,status:"fetched" as const,url:sourceUrl,normalizedUrl:sourceUrl,gdprTransparencyTopicCandidates:gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections)}};
  assert.deepEqual(adaptGdprTransparencyTopicCandidatesForProduction({...input,isTargetRelevantPrivacyPolicy:false}).acceptedProductionSignals,[]);
  const result=adaptGdprTransparencyTopicCandidatesForProduction({...input,isTargetRelevantPrivacyPolicy:true});
  assert.ok(result.acceptedProductionSignals.some(s=>s.disclosureType==="controller_contact"));
  const runtimeArtifacts={policyDisclosureSummary:{article13DisclosureSignals:result.acceptedProductionSignals,gdprTransparencyEvidenceProfile:result.profile,gdprTransparencyProductionEvidenceEnabled:result.productionEvidenceEnabled}};
  const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  assert.ok(normalizedConcerns.some(c=>c.originKey==="gdpr_transparency.article13.controller_contact"));
  const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited:false,events:[],normalizedConcerns,runtimeArtifacts,scanCompleted:true,snapshot:{}});
  const rows=deriveGdprEprivacyCoverageChecklist({coverageLimited:false,coverageOutcomes,projectedFindings:[],unifiedFindings:[],scanCompleted:true});
  assert.equal(rows.find(r=>r.id==="controller_contact_disclosure")?.evidenceState,"observed");
  assert.notEqual(rows.find(r=>r.id==="dpo_contact_point_disclosure")?.evidenceState,"observed");
});
