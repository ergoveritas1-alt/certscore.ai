# CertScore.ai policy research exclusion

Local correction, October 24, 2026. No deployment or historical scan rewrite.

The reported URL, `https://certscore.ai/insights/privacy-policy-transparency-study-2026`,
is a research publication. Its checked-in source is
`content/insights/privacy-policy-transparency-study-2026.html`, with article metadata,
research methods and the title “Your data can outlast your account by years.”

The shared privacy-surface classifier previously accepted policy words in the URL
or label. Existing editorial checks did not identify this study and could be
bypassed by a label containing “policy.” The correction adds the canonical reason
`research_or_reference_not_policy_document` for explicit policy-study/reference
publication titles or terminal slugs. It does not block entire research/insights
folders or use a CertScore.ai-specific hostname/URL blacklist.

The same reason prevents HTML and retained rendered-link discovery from reviving
these publications through PDF/index fallbacks or assisted discovery. The existing
policy-document role assessment also rejects the research candidate, even when
quoted policy passages provide substantive disclosure matches. Fetch eligibility
uses the same canonical reason. No report-layer filtering or scoring change.

Regression coverage includes the exact URL, generic policy labels, descriptive
article titles, query/fragment variants, a PDF study, an opaque article URL with an
explicit study title, genuine `/privacy` and `/research/privacy-policy` routes,
study-participant notices, and the actual checked-in article. Existing multilingual
classifier, document-body, rendered-link and verified-document URL tests are also
run locally. Genuine policy documents remain eligible; this is not a complete
semantic classifier for every possible research title or language.

Existing persisted reports are untouched. The screenshot's stored result will not
change from this local correction; future scans need separately approved deployment.

Cost: no additional requests, model/API calls, storage or capture time. Extra bounded
string matching is estimated below $0.01/month at 100,000 scans, within pre-approval;
excluded candidates may avoid downstream work, but savings have not been measured.
