# Post-canonical Mini policy-review evaluation

Internal calibration artifact only. It is not customer-facing or production eligible.

## Outcome

- Cases: 25
- Reference rows: 200
- Human-adjudicated disagreement rows: 86
- Three-model-consensus rows not independently human-reviewed: 114
- Updated Mini completed rows: 192
- Updated Mini failed rows: 8
- Baseline Mini exact agreement: 74.0%
- Updated Mini exact agreement: 49.0%
- Updated Mini agreement on human-adjudicated rows: 44.6%
- Updated Mini observed precision / recall: 92.5% / 42.6%
- Formal independent-review gate: blocked
- Production eligible: false

The 86 model-disagreement rows use the reviewed workbook decisions. The other 114 rows use unanimous three-model consensus as a calibration baseline, not as independent human gold.

## Agreement by topic

| Topic | Complete | Failed | Agreement |
| --- | ---: | ---: | ---: |
| Processing-purpose disclosure | 24 | 1 | 20.8% |
| Processing legal-basis language | 24 | 1 | 29.2% |
| Retention period or substantive criteria | 24 | 1 | 58.3% |
| International-transfer disclosure | 24 | 1 | 25.0% |
| Named vendors or recipient categories | 24 | 1 | 66.7% |
| Substantive privacy-rights signals | 24 | 1 | 66.7% |
| Observed cookie/storage names | 24 | 1 | 91.7% |
| Policy/runtime comparison | 24 | 1 | 33.3% |

## Completion failures

- kbdlab-20260630

## Remaining disagreements

| Case | Topic | Reference | Updated Mini | Reference source |
| --- | --- | --- | --- | --- |
| amazon-20260629 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| amazon-20260629 | Processing legal-basis language | observed | ambiguous | human_adjudicated_disagreement |
| amazon-20260629 | Retention period or substantive criteria | ambiguous | insufficient_retained_evidence | human_adjudicated_disagreement |
| amazon-20260629 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| amazon-20260629 | Policy/runtime comparison | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| bbc-20260611 | Processing-purpose disclosure | insufficient_retained_evidence | ambiguous | human_adjudicated_disagreement |
| bbc-20260611 | Named vendors or recipient categories | insufficient_retained_evidence | observed | three_model_consensus_unreviewed |
| bbc-20260611 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| caltech-20260701 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| caltech-20260701 | Processing legal-basis language | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| caltech-20260701 | Retention period or substantive criteria | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| caltech-20260701 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| caltech-20260701 | Substantive privacy-rights signals | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| caltech-20260701 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| certscore-20260630 | Processing legal-basis language | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| certscore-20260630 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| certscore-20260630 | Observed cookie/storage names | not_observed_with_sufficient_coverage | observed | three_model_consensus_unreviewed |
| certscore-20260630 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| cimediacloud-20260629 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| cimediacloud-20260629 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| cimediacloud-20260629 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| cimediacloud-20260629 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| cnn-20260629 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| cnn-20260629 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| cnn-20260629 | Retention period or substantive criteria | ambiguous | insufficient_retained_evidence | three_model_consensus_unreviewed |
| cnn-20260629 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| cnn-20260629 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| ebay-20260701 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| ebay-20260701 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| ebay-20260701 | Retention period or substantive criteria | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| ebay-20260701 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| ikea-20260629 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| ikea-20260629 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| ikea-20260629 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| ikea-20260629 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| mit-20260626 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| mit-20260626 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| mit-20260626 | Retention period or substantive criteria | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| mit-20260626 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| mit-20260626 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| nbcnews-20260626 | Processing-purpose disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| nbcnews-20260626 | Processing legal-basis language | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| nbcnews-20260626 | Retention period or substantive criteria | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| nbcnews-20260626 | International-transfer disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| nbcnews-20260626 | Named vendors or recipient categories | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| nbcnews-20260626 | Substantive privacy-rights signals | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| nbcnews-20260626 | Policy/runtime comparison | conflicting | insufficient_retained_evidence | human_adjudicated_disagreement |
| numastays-20260626 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| numastays-20260626 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| numastays-20260626 | International-transfer disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| numastays-20260626 | Policy/runtime comparison | conflicting | insufficient_retained_evidence | human_adjudicated_disagreement |
| oxfam-root-20260725 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| oxfam-root-20260725 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| oxfam-root-20260725 | International-transfer disclosure | conflicting | ambiguous | human_adjudicated_disagreement |
| oxfam-root-20260725 | Policy/runtime comparison | conflicting | insufficient_retained_evidence | three_model_consensus_unreviewed |
| oxfam-www-20260725 | Processing-purpose disclosure | observed | ambiguous | three_model_consensus_unreviewed |
| oxfam-www-20260725 | Processing legal-basis language | observed | ambiguous | three_model_consensus_unreviewed |
| oxfam-www-20260725 | International-transfer disclosure | conflicting | ambiguous | human_adjudicated_disagreement |
| oxfam-www-20260725 | Policy/runtime comparison | conflicting | insufficient_retained_evidence | human_adjudicated_disagreement |
| sega-20260626 | Processing-purpose disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| sega-20260626 | Processing legal-basis language | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| sega-20260626 | International-transfer disclosure | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| sega-20260626 | Named vendors or recipient categories | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| sega-20260626 | Substantive privacy-rights signals | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| sega-20260626 | Observed cookie/storage names | not_observed_with_sufficient_coverage | observed | three_model_consensus_unreviewed |
| sega-20260626 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| vogue-20260701 | Processing-purpose disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vogue-20260701 | Processing legal-basis language | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vogue-20260701 | Retention period or substantive criteria | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| vogue-20260701 | International-transfer disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| vogue-20260701 | Named vendors or recipient categories | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vogue-20260701 | Substantive privacy-rights signals | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vogue-20260701 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| volkswagen-20260626 | Processing-purpose disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| volkswagen-20260626 | Processing legal-basis language | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| volkswagen-20260626 | Retention period or substantive criteria | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| volkswagen-20260626 | International-transfer disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| volkswagen-20260626 | Named vendors or recipient categories | not_observed_with_sufficient_coverage | observed | human_adjudicated_disagreement |
| volkswagen-20260626 | Substantive privacy-rights signals | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| vox-20260701 | Processing-purpose disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vox-20260701 | Processing legal-basis language | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vox-20260701 | Retention period or substantive criteria | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| vox-20260701 | International-transfer disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vox-20260701 | Named vendors or recipient categories | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vox-20260701 | Substantive privacy-rights signals | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| vox-20260701 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| w3-20260614 | Processing-purpose disclosure | not_observed_with_sufficient_coverage | ambiguous | human_adjudicated_disagreement |
| w3-20260614 | Processing legal-basis language | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| w3-20260614 | Retention period or substantive criteria | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| w3-20260614 | International-transfer disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| w3-20260614 | Named vendors or recipient categories | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| w3-20260614 | Substantive privacy-rights signals | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| weather-20260614 | Processing-purpose disclosure | observed | ambiguous | human_adjudicated_disagreement |
| weather-20260614 | Substantive privacy-rights signals | ambiguous | insufficient_retained_evidence | three_model_consensus_unreviewed |
| weather-20260614 | Policy/runtime comparison | observed | insufficient_retained_evidence | human_adjudicated_disagreement |
| wikipedia-20260613 | Processing-purpose disclosure | observed | insufficient_retained_evidence | three_model_consensus_unreviewed |
| wikipedia-20260613 | Named vendors or recipient categories | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |
| wise-20260611 | International-transfer disclosure | not_observed_with_sufficient_coverage | insufficient_retained_evidence | human_adjudicated_disagreement |

### amazon-20260629 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly lists processing purposes and examples of use, including purchase/delivery, troubleshooting/improvement, recommendations/personalization, device services, and legal compliance.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### amazon-20260629 — Processing legal-basis language

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — Legal-basis references are retained and, on a practical reading, disclose the bases relied on. Evidence: "By using Amazon Services, you are consenting to the practices described in this Privacy Notice" and "Comply with legal obligations" (policy_surface_b27095be/777bee15). Reasoning: Consent framing plus a legal-obligation reference tied to processing are legal-basis disclosures in substance, even if not organized as a GDPR-style mapping. Disagreement: Mini/Sol demand a formal basis-to-processing mapping; the retained language is close enough to the topic's intent to count, wit…
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### amazon-20260629 — Retention period or substantive criteria

- Reference: `ambiguous` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: A generic reference to retaining data does not establish a retention period or substantive retention criteria. Reason codes: generic_retention_mention_without_period_or_criteria 5.6 Sol confidence: 80%
- Mini rationale: The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_period_or_criteria_retained, retention_evidence_truncated_or_incomplete

### amazon-20260629 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy contains an explicit cross-border transfer framework participation statement and a disclosure statement about sharing with subsidiaries and third parties.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### amazon-20260629 — Policy/runtime comparison

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy statements about cookies and advertising align with runtime observations of first-party and third-party cookies and an Amazon Ads tracker vendor.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_promises_vs_runtime_third_party_tracking, preconsent_third_party_cookie_observed, policy_runtime_comparison_precondition_not_met

### bbc-20260611 — Processing-purpose disclosure

- Reference: `insufficient_retained_evidence` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — Strong exception: the capture ends at the table of contents. Evidence: policy_surface_7bbab3c1 truncates at "3. HOW WE USE YOUR INFORMATION" with no body text. Reasoning: The heading proves a purposes section exists in the real document, so calling it not-observed would be affirmatively wrong, and no substantive text exists to observe — the truncation is the whole story. Disagreement: Mini's weak observed rests on a heading; a heading is not a disclosure.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### bbc-20260611 — Named vendors or recipient categories

- Reference: `insufficient_retained_evidence` (three_model_consensus_unreviewed)
- Updated Mini: `observed`
- Reference rationale: The retained text mentions a Cookies Notice, but it does not retain any vendor list or third-party disclosure details.
- Mini rationale: The retained policy text references additional notices and a Cookies Notice, which is a substantive recipient/notice-category disclosure signal in the retained packet.
- Mini evidence: "our Cookies Notice explains how we use web technologies such as cookies." | "If you are a California resident, see here for our California Notice at Collection"
- Mini reason codes: named_notice_categories

### bbc-20260611 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy excerpt references a Cookies Notice, and the runtime packet shows pre-consent tracking and third-party cookies. The retained evidence is limited, but there is no direct contradiction in the captured materials. Retained evidence: • "For example, our Cookies Notice explains how we use web technologies such as cookies." • CONFLICT: "Sourcepoint CMP" Evidence refs: policy_surface_7bbab3c1 Reason codes: POLICY_MENTIONS_COOKIES_NOTICE, RUNTIME_SHOWS_PRECONSENT_TRACKING Mini confidence: 84%
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_cookies_notice_only, runtime_preconsent_third_party_cookies_observed, policy_runtime_comparison_precondition_not_met

### caltech-20260701 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The notice expressly lists multiple processing purposes, including site operation, support, improvement, analytics, security, advertising, vendor/business operations, and legal compliance.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### caltech-20260701 — Processing legal-basis language

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Processing-tied legal bases appear in the retained notice. Evidence: disclosure "when you provide us your consent to do so" (Section 3) and processing "To comply with the law or legal orders" (Section 2) (policy_surface_5ec8250f). Reasoning: Consent and legal obligation are explicitly tied to specific processing, satisfying the topic's intent even though the fuller GDPR supplement (linked, unretained) likely elaborates. Disagreement: Mini/Sol treat these as incidental mentions; Sonnet's reading that they are enumerated bases tied to processing is the more practical one.
- Mini rationale: The packet retains a consent/acceptance statement, but not a clear legal-basis disclosure for processing in the sense required by this review.
- Mini evidence: “Your use of the sites will be deemed as your consent to and acceptance of the terms and conditions of this Notice.”
- Mini reason codes: consent_language_not_clearly_legal_basis_for_processing, no_retained_framework_specific_basis_statement

### caltech-20260701 — Retention period or substantive criteria

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Retention is genuinely absent from a fully captured notice. Evidence: policy_surface_5ec8250f spans all ten sections with no retention period or criteria anywhere, not even 'as long as necessary'. Reasoning: Adequate coverage plus absent disclosure is the definition of this category. Disagreement: Mini's template ambiguous presumes a generic retention mention that is not in the retained text.
- Mini rationale: The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_language_present, retention_evidence_truncated_or_incomplete

### caltech-20260701 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The notice explicitly states transfers from outside the United States to the United States and cross-border transfers to other countries or jurisdictions.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### caltech-20260701 — Substantive privacy-rights signals

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No substantive rights disclosure in the retained notice. Evidence: in-document content is limited to email unsubscribe and ad-network opt-out links; EEA/UK users are pointed to an external GDPR page (policy_surface_5ec8250f). Reasoning: Taking the retained notice as the disclosure, access/correction/deletion/portability/objection rights are not stated — the majority's final call. Caveat: the linked GDPR page was not retained; a follow-up capture could change this. Disagreement: Sol's ambiguous adds no information the reviewer can act on.
- Mini rationale: The retained evidence does not completely capture the governing rights section, so substantive rights coverage cannot be determined.
- Mini evidence: No excerpt retained.
- Mini reason codes: opt_out_or_preference_management_present, rights_evidence_truncated_or_incomplete

### caltech-20260701 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Disclosed technologies match observed ones with no contradiction. Evidence: policy discloses cookies for advertising/analytics and security purposes (policy_surface_5ec8250f); runtime shows Cloudflare Bot Management and Google Analytics. Reasoning: Alignment on the retained anchors; the notice makes no consent-gating promise, so pre-consent GA is not a contradiction. Disagreement: Sonnet's conflicting hangs a consent gate on a footer link label, which is not a policy representation.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_advertising_and_third_party_partners, runtime_shows_analytics_tracking_without_observed_consent_ui, policy_runtime_comparison_precondition_not_met

### certscore-20260630 — Processing legal-basis language

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No named legal basis for CertScore's own processing in a substantively retained policy. Evidence: Section 8 references consent only for optional analytics cookies; /gdpr basis language concerns scanned third-party sites (policy_surface_b12224f0, 47450f37). Reasoning: Cookie-consent mechanics are not a lawful-basis framework; the policy is otherwise well captured (rows 3, 22), supporting the final absence call. Disagreement: Sol stretches an analytics-consent gate into a legal-basis disclosure.
- Mini rationale: The retained packet includes consent-related and verification language, but no retained passage clearly states a general legal-basis framework such as consent, contract, legal obligation, legitimate interests, or similar as the basis for processing.
- Mini evidence: “optional analytics after consent” | “We may ask for proportionate identity verification before disclosing, deleting, or changing records.”
- Mini reason codes: no_general_legal_basis_statement_retained

### certscore-20260630 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy directly states cross-border processing and identifies the United States and other countries.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### certscore-20260630 — Observed cookie/storage names

- Reference: `not_observed_with_sufficient_coverage` (three_model_consensus_unreviewed)
- Updated Mini: `observed`
- Reference rationale: The retained policy discusses cookies and similar technologies, but no specific cookie identifiers are named in the retained evidence, so cookie inventory is not observed.
- Mini rationale: The scan retained 19 identifiable cookie/storage names from policy evidence.
- Mini evidence: “CertScore.ai uses cookies and similar technologies to operate the service, maintain sessions, remember preferences, protect accounts, and understand usage.”
- Mini reason codes: no_specific_cookie_or_storage_identifier_retained, retained_cookie_storage_name_observed, policy_cookie_name_observed

### certscore-20260630 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Policy and runtime align on the consent surface with no established contradiction. Evidence: policy describes accept/reject/manage analytics controls; runtime confirms all three ("Reject analytics","Allow analytics","Cookie settings"). Reasoning: The retained anchors match; the lone preConsentTracking flag is unidentified (thirdPartyVendors/thirdPartyCookiesPreConsent both false, tracker/cookie journeys 0) and cannot be tied to any policy-covered analytics tool, so it is a review footnote rather than a conflict. Disagreement: Sol's conflicting rests on that unattributed flag; S…
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_promises_vs_runtime_preconsent_behavior, policy_runtime_comparison_precondition_not_met

### cimediacloud-20260629 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The privacy policy expressly states processing purposes, including contract/business purposes and legitimate interests, with examples of account administration, service delivery, transactions, communications, and support.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### cimediacloud-20260629 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy explicitly references contract/business purposes, legitimate interests, and consent as bases for processing.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### cimediacloud-20260629 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy states cross-border transfers and identifies transfer mechanisms for EU and UK transfers.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### cimediacloud-20260629 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Retained runtime evidence corroborates the policy’s specific disclosure of Google Analytics and DoubleClick. This is bounded consistency evidence and does not establish that every observed runtime vendor or pre-consent behavior is fully described by the retained policy capture. Retained evidence: • We may use analytics tools and other third-party technologies such as Google Analytics and DoubleClick Cookies to collect non-personal information, including information that has been de-identified or pseudonymized, in the form of various usage and user metrics when you use Ci or visit our websites…
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_tracking_or_cookie_controls_but_runtime_shows_preconsent_third_party_tracking, policy_runtime_comparison_precondition_not_met

### cnn-20260629 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly states processing purposes, including using recordings to diagnose issues and improve engagement, and generally describes purposes for processing personal information.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### cnn-20260629 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy includes explicit lawful-basis language, including consent and a statement that lawful bases are explained where necessary.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### cnn-20260629 — Retention period or substantive criteria

- Reference: `ambiguous` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: A generic reference to retaining data does not establish a retention period or substantive retention criteria.
- Mini rationale: The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_period_or_criteria_present, retention_evidence_truncated_or_incomplete

### cnn-20260629 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy explicitly states that information could be transferred, transmitted, processed outside the country, and shared with third parties.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### cnn-20260629 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Disclosed tracking matches observed tracking; no gating promise is contradicted. Evidence: policy discloses recording of user interactions and sharing with service providers (policy_surface_96ce8a40/38ed1769); runtime shows tracking, vendors, and a consent UI. Reasoning: The "by providing your information... you consent" clause is implied-consent framing, not an affirmative gate, so pre-consent tracking is consistent with the retained representations. Disagreement: Sonnet's conflicting builds a consent gate the text never promises; noted for follow-up: rejectControlObserved=fal…
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_consent_or_opt_out, runtime_preconsent_third_party_tracking_observed, policy_runtime_comparison_precondition_not_met

### ebay-20260701 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly states that it summarizes purposes for processing personal data and includes a section titled purposes and legal bases for data processing.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### ebay-20260701 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text explicitly references legal bases for processing, including consent and legitimate interests, and organizes processing by legal basis.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### ebay-20260701 — Retention period or substantive criteria

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Concrete retention periods and criteria are retained. Evidence: "retention periods are generally between 6 and 10 years (e.g. for contracts, notifications and business letters)" (policy_surface_8ca3342e) and Payments ToS inactivity triggers (six years no access, three years no transactions) (policy_surface_6a995304). Reasoning: Numeric periods and defined triggers decisively exceed the bar. Disagreement: Mini/Sol used an unquoted generic template; Sonnet's referenced quotations are the only rationale engaging the evidence.
- Mini rationale: The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_periods_stated, retention_criteria_stated, retention_evidence_truncated_or_incomplete

### ebay-20260701 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly addresses cross-border transfers and third-country transfer conditions.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### ikea-20260629 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text explicitly states several processing purposes, including customer support, newsletter delivery, reservation/service fulfillment, service improvement, future exhibitions, content personalization, and advertising.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### ikea-20260629 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly identifies legal bases for multiple processing activities, including legitimate interest, performance of an agreement, and consent.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### ikea-20260629 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy states that third parties may be located inside and outside the EEA and that agreements are in place to protect information both within and outside the EEA.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### ikea-20260629 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Runtime behavior matches the policy's consent model. Evidence: policy states functional cookies are always set without consent and non-essential cookies stop on withdrawal; runtime shows only first-party functional/security/consent cookies, OneTrust CMP with accept/reject controls, and no pre-consent third-party activity. Reasoning: Every retained runtime signal aligns with the retained representations. Disagreement: Sol's ambiguous rests on one unknown-purpose cookie (ikexp_id), a minor gap.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_claim_vs_runtime_preconsent_tracking, policy_claim_vs_runtime_consent_state_mismatch, policy_runtime_comparison_precondition_not_met

### mit-20260626 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained privacy policy expressly states a processing purpose for personal information and separately states an analytics/improvement purpose for Google Analytics.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### mit-20260626 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy explicitly names legitimate interests and contractual obligations as the basis for processing.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### mit-20260626 — Retention period or substantive criteria

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Specific retention criteria beyond bare necessity are retained. Evidence: records kept for the "lifelong" MIT relationship until opt-out, then a "core set" retained for archival/scientific/historical research and legal-claims defense, plus IRS-driven financial retention (policy_surface_93e2e8ea). Reasoning: Duration concept, post-opt-out scope, and purpose-specific criteria are substantive. Disagreement: Mini/Sol's unquoted generic template does not engage this text; majority rejected.
- Mini rationale: The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_period_present, retention_criteria_present, retention_evidence_truncated_or_incomplete

### mit-20260626 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The policy expressly describes transfer of personal information outside the EEA to the United States.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### mit-20260626 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No material discrepancy retained. Evidence: policy states the main site uses no cookies except Google Analytics'; runtime shows one vendor (Google Tag Manager), zero cookies captured, no banner, no pre-consent third-party cookies. Reasoning: GTM is a delivery mechanism consistent with a GA deployment; nothing observed contradicts the retained representation. Disagreement: Sol's ambiguous rests on the GTM/GA product distinction, which produced no retained contradiction.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_third_party_analytics, runtime_third_party_vendor_observed, no_direct_cookie_mismatch, policy_runtime_comparison_precondition_not_met

### nbcnews-20260626 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained privacy policy expressly states that it explains the purposes for which information is used and lists examples of those purposes.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: purpose_statement_retained, purpose_examples_retained, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy contains a dedicated legal-basis section naming specific bases such as performance of a contract, legitimate interest, and legal obligation.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_language_retained, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — Retention period or substantive criteria

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy includes a retention section describing retention criteria and concrete examples of retention periods and suppression-list retention.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_period_disclosed, retention_criteria_disclosed, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — International-transfer disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Transfer disclosures are absent from a substantially retained corpus. Evidence: privacy policy, cookie notice, and terms (policy_surface_228175e7, d3839543, 44827012) include UK/EU representatives and a Japan joint-use provision but no destinations, circumstances, or mechanisms. Reasoning: Representative contacts are governance signals, not transfer disclosures; the corpus depth supports concluding the disclosure is absent rather than unretrieved. Disagreement: Mini counts representative contacts as transfer evidence; Sol's coverage doubt is noted but the breadth of retained do…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: cross_border_contact_and_controller_disclosure, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — Named vendors or recipient categories

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy expressly discloses categories of recipients such as service providers, audience measurement/analytics companies, advertising partners, and related businesses.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: named_vendor_retained, recipient_category_retained, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — Substantive privacy-rights signals

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained documents list access, correction, deletion, restriction/object, third-party list, and opt-out rights, including California-specific opt-out mechanisms.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: rights_menu_retained, opt_out_rights_retained, cited_policy_sources_not_attributed_to_target

### nbcnews-20260626 — Policy/runtime comparison

- Reference: `conflicting` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Strong retained contradiction: policy-described controls absent while ad tracking fired pre-consent. Evidence: policy directs users to a "Your Privacy Choices" toggle, GPC recognition, and TCF participation (policy_surface_44827012); runtime shows preConsentTracking and thirdPartyCookiesPreConsent true (Adobe demdex ~4.4s), OneTrust detected but consentBannerLikelyPresent=false, no controls observed. Reasoning: Represented choice mechanics were not found while gated behavior ran anyway — both sides retained. Disagreement: Sol's observed never addresses the missing represented c…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_promise_vs_runtime_surface_mismatch, cited_policy_sources_not_attributed_to_target

### numastays-20260626 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy text expressly states several processing purposes, including answering inquiries, implementing the application process, and ensuring communication with guests.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### numastays-20260626 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The privacy policy expressly identifies multiple legal bases under GDPR, including consent, contract necessity, legal obligation, and legitimate interests.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### numastays-20260626 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The privacy policy expressly discusses transfers outside the EEA and names adequacy decisions and standard contractual clauses as transfer mechanisms.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### numastays-20260626 — Policy/runtime comparison

- Reference: `conflicting` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Strong retained contradiction on consent gating. Evidence: policy ties consent-dependent processing to Art. 6(1)(a) and limits legitimate interest to technically necessary cookies (policy_surface_365f869c); runtime shows preConsentTrackingObserved=true, thirdPartyVendorsObserved=true, ad/analytics vendors (Google Ads/DoubleClick, GA, Klaviyo) active pre-consent with a Consentmanager CMP present. Reasoning: Both the gating representation and the contradicting behavior are retained — the paradigm conflicting case. Disagreement: Mini's observed ignores the pre-consent activity; So…
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_legitimate_interests_for_technical_cookies_only, runtime_preconsent_tracking_observed, runtime_advertising_and_analytics_vendors_observed, policy_runtime_comparison_precondition_not_met

### oxfam-root-20260725 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained policy and cookie notice contain substantive processing-purpose statements describing use for provided/compatible purposes, site analytics and improvement, campaign/social-media assessment, and cookie-enabled basic analytics.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### oxfam-root-20260725 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The privacy policy expressly names contract, legal obligation, legitimate interest, and consent as legal bases.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### oxfam-root-20260725 — International-transfer disclosure

- Reference: `conflicting` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — Strong retained inconsistency: a valid mechanism cited alongside an invalidated one. Evidence: transfers to Affiliates "under the EC's model data protection clauses" plus payment provider "certified under the EU-US Privacy Shield" (policy_surface_66b78aa7). Reasoning: Privacy Shield was invalidated in July 2020 and superseded by the EU-US DPF long before the 2026-07-25 scan; the rules bar counting stale framework language as affirmative disclosure and this is a material retained contradiction, flagged as a review signal. Disagreement: Mini's observed credits the defunct framewo…
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### oxfam-root-20260725 — Policy/runtime comparison

- Reference: `conflicting` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained runtime evidence shows third-party tracking, advertising, and analytics activity, which materially extends beyond the policy’s high-level disclosures and creates a policy/runtime mismatch on observed tracking behavior.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_mentions_consent_controls_but_runtime_shows_preconsent_tracking, policy_mentions_cookie_choice_banner_but_runtime_lacks_actionable_controls, policy_runtime_comparison_precondition_not_met

### oxfam-www-20260725 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained privacy notices explicitly describe multiple processing purposes, including site operation, analytics, marketing communications, fundraising, advocacy, and directing users to regional affiliate sites.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### oxfam-www-20260725 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `ambiguous`
- Reference rationale: The retained notices expressly identify legal bases including contract, legal obligations, legitimate interests, and consent.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing legal-basis language; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_topic_relevance_not_deterministically_confirmed

### oxfam-www-20260725 — International-transfer disclosure

- Reference: `conflicting` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — Same invalidated-framework inconsistency on the www surface. Evidence: SCC/model-clause disclosure plus "certified under the EU-US Privacy Shield" (policy_surface_66b78aa7, c6e5a2a9) against a 2026-07-25 scan date. Reasoning: Citing a CJEU-invalidated mechanism as an active safeguard alongside current-mechanism claims is a material retained inconsistency — a review signal, not a legal determination. Disagreement: Mini's observed counts the stale framework as affirmative transfer disclosure.
- Mini rationale: Retained text did not meet the canonical relevance floor for International-transfer disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfers_topic_relevance_not_deterministically_confirmed

### oxfam-www-20260725 — Policy/runtime comparison

- Reference: `conflicting` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Strong retained contradiction: a promised first-visit consent banner that runtime never found. Evidence: "a message will appear giving you the opportunity to accept all cookies or decline" (policy_surface_413f7cff); runtime consentUi captureStatus 'no_evidence', likelyPresent=false, with preConsentTracking, thirdPartyCookiesPreConsent, and sessionReplay all true plus undisclosed vendors (e.g., HubSpot) beyond the cookie table. Reasoning: A concrete representation is contradicted by retained runtime capture. Disagreement: Sol's mixed-scope caveat moderates confidence but does no…
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: preconsent_tracking_observed, third_party_cookies_preconsent_observed, policy_consent_language_vs_runtime, policy_runtime_comparison_precondition_not_met

### sega-20260626 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy and notice text expressly lists collection/use purposes, including product delivery, customer service, personalization, marketing/advertising, analytics, bug detection, security/fraud/legal compliance, and anti-cheat/anti-hacking.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: PURPOSE_DISCLOSED, MULTIPLE_SURFACES, cited_policy_sources_not_attributed_to_target

### sega-20260626 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy expressly identifies lawful bases used for processing, including consent, contract, legal obligations, and general business operations.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: LEGAL_BASIS_EXPRESSED, cited_policy_sources_not_attributed_to_target

### sega-20260626 — International-transfer disclosure

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — The policy discloses transfers subject to safeguards, meeting the topic's intent. Evidence: disclosures "subject to legally required security, contractual and transfer safeguards" plus sharing across the wider SEGA Group and "If such transfer is subject to any mandatory restrictions under applicable laws, we will comply" (policy_surface_a139c595). Reasoning: The policy acknowledges cross-entity transfers and commits to safeguards/legal restrictions — a transfer disclosure in substance, though without named mechanisms or destinations (flagged for the reviewer). Disagreement: Son…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: TRANSFER_DISCLOSED, cited_policy_sources_not_attributed_to_target

### sega-20260626 — Named vendors or recipient categories

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained documents identify multiple third-party categories and examples of service providers, vendors, advertising partners, affiliates, and platform operators.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: RECIPIENT_CATEGORIES_DISCLOSED, NAMED_PARTNER_CATEGORIES, cited_policy_sources_not_attributed_to_target

### sega-20260626 — Substantive privacy-rights signals

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Substantive rights beyond opt-out preferences are retained. Evidence: GPC-based opt-out of sale/sharing/targeted advertising under applicable law, marketing unsubscribe, and an EEA/UK right to refer complaints to a supervisory authority (policy_surface_a139c595). Reasoning: A supervisory-authority complaint right and a statutory opt-out are enumerated data-subject rights. Disagreement: Mini/Sol applied an opt-out-only template without engaging the complaint-referral passage; majority rejected.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: RIGHTS_OR_CHOICES_SIGNAL, cited_policy_sources_not_attributed_to_target

### sega-20260626 — Observed cookie/storage names

- Reference: `not_observed_with_sufficient_coverage` (three_model_consensus_unreviewed)
- Updated Mini: `observed`
- Reference rationale: Retained cookie-policy evidence did not contain a typed or directly named cookie identifier; categories alone do not establish a named-cookie inventory.
- Mini rationale: The scan retained 5 identifiable cookie/storage names from runtime evidence.
- Mini evidence: “__Host-authjs.csrf-token” | “__Secure-authjs.callback-url” | “preferredLanguage” | “signupStyle” | “feed-posts--page-1--tags-978”
- Mini reason codes: SPECIFIC_IDENTIFIER_PRESENT, retained_cookie_storage_name_observed, runtime_cookie_storage_name_observed

### sega-20260626 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — The storage-specific consent promise is not contradicted by retained runtime facts. Evidence: policy gates "the storage of Cookies" (except strictly necessary) on consent (policy_surface_b3469665); runtime shows thirdPartyCookiesPreConsentObserved=false — no pre-consent cookie storage — with pre-consent vendor requests noted. Reasoning: The retained promise concerns storage, and storage was not observed pre-consent, so the retained packet shows consistency on the actual representation; pre-consent vendor contact is flagged as a follow-up signal. Disagreement: Mini/Sonnet's conf…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: POLICY_RUNTIME_MISMATCH, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy text explicitly states several substantive processing purposes, including providing services, fulfilling requests, improving services, and personalization/marketing.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: purpose_disclosed, multiple_processing_purposes_retained, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy expressly names legal bases for processing, including performance of a contract and compliance with legal obligations.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_expressed, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Retention period or substantive criteria

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — A retention criterion is stated in the policy's dedicated section. Evidence: §9 Retention: data kept as "reasonably necessary and proportionate to achieve the purpose(s)... unless a longer retention period is required or allowed by law" (policy_surface_74e43122). Reasoning: A purpose-necessity-plus-proportionality criterion with a legal-hold exception is a retention disclosure in substance, though generic — noted for the reviewer. Disagreement: Sonnet's ambiguous applies the boilerplate discount; under the finality preference the stated criterion carries the intent of the topic.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_criteria_disclosed, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — International-transfer disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No transfer substance appears despite the section being reached twice. Evidence: "13. International Transfers." appears in the ToC and in-body, each time followed by legal-basis/contact-us content with no destinations, circumstances, or mechanisms anywhere in either retained document (policy_surface_96906465, 74e43122). Reasoning: Two passes over the section produced no transfer language and no framework claims exist to evaluate — the majority's final call. Caveat: the heading-then-unrelated-text pattern suggests extraction damage; a re-capture is advisable. Disagreement: Sol's…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: international_transfer_section_retained, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Named vendors or recipient categories

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The policy names categories of recipients and specific third parties/vendors to whom personal information may be disclosed.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: recipient_categories_disclosed, named_vendors_retained, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Substantive privacy-rights signals

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy text expressly lists multiple data subject/privacy rights and an appeal mechanism.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: rights_listed, appeal_right_retained, cited_policy_sources_not_attributed_to_target

### vogue-20260701 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Disclosed opt-out/advertising model aligns with runtime under a US framework. Evidence: policy honors GPC and names Google, Meta, TikTok, LinkedIn among recipients; runtime shows those vendors plus a Sourcepoint CMP with banner likely present. Reasoning: The consent language is conditional ("where required by applicable law") within a CPRA-style opt-out model, so pre-consent tracking does not contradict a retained representation. Disagreement: Sonnet's conflicting infers a universal consent gate the text never promises; unobserved banner controls remain a capture-quality note.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_promise_vs_runtime_observation, same_jurisdiction_same_consent_state_not_fully_aligned, cited_policy_sources_not_attributed_to_target

### volkswagen-20260626 — Processing-purpose disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No processing-purpose disclosure exists in the captured surfaces. Evidence: all six privacy-labeled documents are full-length vehicle-marketing pages (ID.3 Neo newsletter, ID. Polo reservation) with zero purpose language. Reasoning: Taking the retained corpus at face value, the topic is simply not addressed — Sonnet's position. Caveat for follow-up: all six privacy URLs resolving to marketing pages suggests a capture routing problem, so a re-scan is advisable. Disagreement: Mini reads marketing calls-to-action as purposes, a keyword-level error.
- Mini rationale: The retained text is product/marketing content rather than privacy-policy substance, so there is no retained evidence of processing purposes.
- Mini evidence: "Der ID. Polo Ab € 33.790,00 inkl. MwSt. ..." | "Entdecke jetzt die Vielfalt unserer Modellpalette ..." | "Sichere dir jetzt mit nur wenigen Klicks deinen ID. Polo ..."
- Mini reason codes: coverage_incomplete, retained_text_not_privacy_policy_content

### volkswagen-20260626 — Processing legal-basis language

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No legal-basis language in the retained corpus. Evidence: none of the six retained documents mentions consent, contract, legal obligation, vital interests, public task, or legitimate interests. Reasoning: Taking the corpus at face value, the topic is unaddressed (Sonnet's call). Re-scan caveat: all privacy URLs returned marketing pages. Disagreement: Mini/Sol's insufficient is defensible but non-final; the caveat preserves their concern.
- Mini rationale: No retained passage in the packet states a legal basis for processing; the available retained text is unrelated marketing content.
- Mini evidence: "Der ID. Polo Ab € 33.790,00 inkl. MwSt. ..."
- Mini reason codes: coverage_incomplete, retained_text_not_privacy_policy_content

### volkswagen-20260626 — Retention period or substantive criteria

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No retention periods or criteria of any kind in the retained corpus. Evidence: all six documents are vehicle-marketing content. Reasoning: The topic is unaddressed in what was captured; re-scan caveat as in row 63. Disagreement: Mini/Sol's insufficient carries the capture concern, retained here as a caveat rather than the verdict.
- Mini rationale: There is no retained retention-period or substantive-criteria passage in the packet; the retained text does not contain privacy-policy retention language.
- Mini evidence: "Der ID. Polo Ab € 33.790,00 inkl. MwSt. ..."
- Mini reason codes: coverage_incomplete, retained_text_not_privacy_policy_content

### volkswagen-20260626 — International-transfer disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No destinations, circumstances, or mechanisms (current or obsolete) anywhere in the retained corpus. Evidence: marketing-only surfaces. Reasoning: No transfer language and no framework claims exist to evaluate; re-scan caveat as in row 63. Disagreement: Mini/Sol's insufficient noted as the caveat.
- Mini rationale: No retained passage discloses international transfers or transfer mechanisms; the packet text available here is not privacy-policy content.
- Mini evidence: "Der ID. Polo Ab € 33.790,00 inkl. MwSt. ..."
- Mini reason codes: coverage_incomplete, retained_text_not_privacy_policy_content

### volkswagen-20260626 — Named vendors or recipient categories

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `observed`
- Reference rationale: Fable 5 seed — No vendor/processor disclosure appears in the retained documents. Evidence: six marketing-content surfaces name no processors or recipient categories; OneTrust and Google Tag Manager appear only in runtime telemetry. Reasoning: Within the retained corpus the disclosure is absent; runtime vendor detection is not a policy disclosure. Same re-scan caveat as row 9. Disagreement: Mini's observed substitutes telemetry for disclosure.
- Mini rationale: Runtime evidence directly identifies vendors/products used on the site, including OneTrust CMP and Google Tag Manager.
- Mini evidence: "OneTrust CMP" | "Google Tag Manager"
- Mini reason codes: runtime_vendor_observed

### volkswagen-20260626 — Substantive privacy-rights signals

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No rights disclosed in any retained document. Evidence: marketing-only surfaces; runtime consentUi shows only cookie-preference controls, which do not establish rights coverage. Reasoning: Topic unaddressed in the captured corpus; re-scan caveat as in row 63. Disagreement: Mini/Sol's insufficient noted as the caveat.
- Mini rationale: The retained evidence shows cookie-choice UI controls, but no retained privacy-rights passage (for example access, deletion, objection, portability, or complaint rights).
- Mini evidence: "Cookie-Einstellungen, Öffnet das Einstellungscenter-Dialogfeld" | "Alle Cookies akzeptieren" | "Auswahl speichern"
- Mini reason codes: coverage_incomplete, ui_not_privacy_rights_text

### vox-20260701 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained privacy notice expressly states processing purposes, including understanding service use, targeting advertising, diagnosing problems, administering the services, and analytics collection.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: purpose_language_present, multiple_processing_purposes_retained, cited_policy_sources_not_attributed_to_target

### vox-20260701 — Processing legal-basis language

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained notice includes an explicit legal-basis section listing contract, legitimate interests, consent, and legal/regulatory obligation.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: legal_basis_language_present, cited_policy_sources_not_attributed_to_target

### vox-20260701 — Retention period or substantive criteria

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Necessity criterion plus a concrete retention-exception scenario are retained. Evidence: "retain your Personal Data for the period necessary to fulfill the purposes... unless a longer retention period" plus retention of deletion-request records and minimum data to keep data deleted (policy_surface_a3216e04). Reasoning: The deletion-record scenario adds substance beyond boilerplate. Disagreement: Sonnet weighs only the truncated generic clause.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: retention_period_or_criteria_present, cited_policy_sources_not_attributed_to_target

### vox-20260701 — International-transfer disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained notice expressly describes transfers from EEA/Switzerland/UK to the United States and other countries.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: cross_border_transfer_disclosure_present, cited_policy_sources_not_attributed_to_target

### vox-20260701 — Named vendors or recipient categories

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The notice explicitly references third-party service providers and third parties collecting and using information on the site’s behalf.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: third_party_categories_present, named_entity_present, cited_policy_sources_not_attributed_to_target

### vox-20260701 — Substantive privacy-rights signals

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained notice lists multiple data-subject rights, including access/know, portability, deletion, opt-out, and California-specific rights.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: rights_language_present, cited_policy_sources_not_attributed_to_target

### vox-20260701 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Disclosed automatic collection by ad/analytics providers matches runtime. Evidence: "We and our third-party service providers (including any third-party content, advertising, and analytics providers) automatically collect certain information... to target advertising" (policy_surface_a3216e04); runtime shows matching third-party tracking. Reasoning: "Consent is one legal basis" is not a gating commitment, so pre-consent activity under a US model contradicts nothing retained. Disagreement: Sonnet infers a consent gate from a legal-basis mention; the CMP-present/no-controls captur…
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_promises_vs_runtime_preconsent_collection, cited_policy_sources_not_attributed_to_target

### w3-20260614 — Processing-purpose disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — No purpose-specific processing language in the retained document. Evidence: policy_surface_4437db21 is mission framing ("Creating a more trustworthy web and protecting user privacy..."). Reasoning: Aspirational language is not a purposes disclosure; taking the capture as given, the topic is unaddressed. Caveat: the governing W3C privacy notice was likely not this page, so a targeted re-capture would firm this up. Disagreement: Mini mistakes mission text for purposes; Sol's insufficient is defensible but less final than the evidence allows.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### w3-20260614 — Processing legal-basis language

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No legal-basis reference in the retained document. Evidence: policy_surface_4437db21 contains mission/navigation content only. Reasoning: Taking the capture at face value, the topic is unaddressed (Mini/Sonnet). Caveat: the governing W3C privacy notice was likely never captured, so a targeted re-scan is recommended before treating this as final. Disagreement: Sol's insufficient survives as the caveat rather than the verdict.
- Mini rationale: The retained packet does not include legal-basis language such as consent, contract, legitimate interests, or similar framework wording.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_legal_basis_language

### w3-20260614 — Retention period or substantive criteria

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No retention language in the retained document. Evidence: policy_surface_4437db21, mission/navigation content only. Reasoning: Topic unaddressed in the capture; same re-scan caveat as row 71. Disagreement: Sol's insufficient preserved as the caveat.
- Mini rationale: No retained passage addresses retention periods or substantive retention criteria.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_retention_text

### w3-20260614 — International-transfer disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No transfer destinations, circumstances, or mechanisms in the retained document. Evidence: policy_surface_4437db21. Reasoning: Topic unaddressed; same re-scan caveat as row 71. Disagreement: Sol's insufficient preserved as the caveat.
- Mini rationale: The retained packet does not include an international-transfer disclosure or comparable transfer mechanism text.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_transfer_disclosure

### w3-20260614 — Named vendors or recipient categories

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No processors, vendors, or recipient categories in the retained document, and no runtime third-party vendors observed. Evidence: policy_surface_4437db21; runtimeContext thirdPartyVendorsObserved=false. Reasoning: Both retained surfaces are silent, supporting absence; re-scan caveat as row 71. Disagreement: Sol's insufficient preserved as the caveat.
- Mini rationale: No retained passage names vendors or recipient categories.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_named_vendors_or_categories

### w3-20260614 — Substantive privacy-rights signals

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No data-subject rights mentioned in the retained document. Evidence: policy_surface_4437db21. Reasoning: Topic unaddressed; re-scan caveat as row 71. Disagreement: Sol's insufficient preserved as the caveat.
- Mini rationale: The retained packet does not include substantive privacy-rights language such as access, deletion, correction, objection, or portability.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_rights_language

### weather-20260614 — Processing-purpose disclosure

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `ambiguous`
- Reference rationale: Fable 5 seed — Purpose disclosures are directly retained in the settings surfaces. Evidence: "control how your data is used, including to tailor advertising to your likely interests based on your activities" and "We may use or share your data with our data vendors" (policy_surface_11bb7b9f, 5a840362). Reasoning: Interest-based advertising and vendor sharing are stated data-use purposes on a legitimate disclosure surface. Disagreement: Sonnet's insufficient evaluates different surfaces and does not engage these passages.
- Mini rationale: Retained text did not meet the canonical relevance floor for Processing-purpose disclosure; nearby or disclosure-shaped wording is not sufficient.
- Mini evidence: No excerpt retained.
- Mini reason codes: processing_purposes_topic_relevance_not_deterministically_confirmed

### weather-20260614 — Substantive privacy-rights signals

- Reference: `ambiguous` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Email unsubscribe or advertising opt-out language does not establish substantive data-subject rights such as access, correction, deletion, objection, portability, or complaint rights.
- Mini rationale: The retained evidence does not completely capture the governing rights section, so substantive rights coverage cannot be determined.
- Mini evidence: No excerpt retained.
- Mini reason codes: opt_out_and_control_signals_retained, rights_evidence_truncated_or_incomplete

### weather-20260614 — Policy/runtime comparison

- Reference: `observed` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — Runtime behavior matches the disclosed opt-out-by-default model. Evidence: do-not-sell page states sharing is the default when cookies are enabled (CPRA framework) (policy_surface_11bb7b9f); runtime shows extensive pre-consent ad-vendor activity with no consent banner. Reasoning: Under a disclosed opt-out model, pre-consent tracking is the represented behavior. Disagreement: Sol's insufficient understates the concrete default-on representation the runtime confirms.
- Mini rationale: A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.
- Mini evidence: No excerpt retained.
- Mini reason codes: policy_opt_out_and_gpc_language_vs_preconsent_tracking_runtime, policy_runtime_comparison_precondition_not_met

### wikipedia-20260613 — Processing-purpose disclosure

- Reference: `observed` (three_model_consensus_unreviewed)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: The retained policy text directly states how information is used for product/site improvement and engagement/accessibility purposes.
- Mini rationale: The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.
- Mini evidence: No excerpt retained.
- Mini reason codes: PURPOSE_USE_EXPLICIT, cited_policy_sources_not_attributed_to_target

### wikipedia-20260613 — Named vendors or recipient categories

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — The sharing topic is engaged but no vendors or recipient categories are disclosed. Evidence: "We do not sell or rent your Personal Information, nor do we give it to others to sell you anything" (policy_surface_dd917c15). Reasoning: The retained passage squarely addresses sharing and names no processors or categories — Sonnet's final call. Caveat: the excerpt is a fragment of a long policy, so a fuller capture could surface the service-providers section. Disagreement: Mini/Sol's insufficient survives as the caveat.
- Mini rationale: No retained passage names vendors or recipient categories.
- Mini evidence: No excerpt retained.
- Mini reason codes: NO_RETAINED_VENDOR_OR_RECIPIENT_CATEGORY

### wise-20260611 — International-transfer disclosure

- Reference: `not_observed_with_sufficient_coverage` (human_adjudicated_disagreement)
- Updated Mini: `insufficient_retained_evidence`
- Reference rationale: Fable 5 seed — No transfer substance in the retained material. Evidence: research policy names vendor domains (Google, DocuSign, BHN Rewards) with a generic data-protection-agreements assurance; no destinations, circumstances, or mechanisms anywhere (policy_surface_7b196d21). Reasoning: The retained evidence engages adjacent topics without any transfer disclosure — Sonnet's call. Caveat: main policy pages captured navigation only; re-scan advisable. Disagreement: Mini/Sol's insufficient preserved as the caveat.
- Mini rationale: No retained excerpt discloses international transfers, transfer destinations, or transfer mechanisms for the target policy surface.
- Mini evidence: No excerpt retained.
- Mini reason codes: no_retained_transfer_disclosure

