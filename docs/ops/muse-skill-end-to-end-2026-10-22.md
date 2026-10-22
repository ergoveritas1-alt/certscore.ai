# CertScore.ai Muse skill end-to-end review

The owner requested a consumer-Muse test against
`https://ergoveritas.com/test1.html`, including the report link and a natural,
working follow-up. The published ZIP was attached to a separate Muse chat and
installed as `certscore-website-privacy-scan` alongside the older local skill.
The initial prompt asked what to pay attention to without mentioning a report
link or follow-up.

Muse reviewed scan `4d6583b9-6fc9-4461-a163-fd51ec23c9bf`, completed October 22,
2026 at 3:33 PM PDT from EU (IE), score 10, partial public-page coverage. The
reported facts remain automated observations for review. No scoring or scanner
logic was changed for this test.

## Observed interaction

Muse included “Open the full CertScore.ai report” and explained that it held the
retained findings, evidence tables, accessibility examples and form/consent
sections. Clicking the actual link opened the correct report in Chrome, with
matching target URL, score, date, region and scan ID.

Muse offered one relevant follow-up: “I can turn these findings into a developer
checklist, grounded in the finding IDs, evidence, and retest steps from this
scan.” Clicking the corresponding button produced a checklist artifact with
finding IDs, retained evidence, suggested owners and verification steps. It
preserved the baseline scan ID and described later retesting without performing
another scan. The offer was useful and did not read like an advertisement.

## Issue found and corrected

The 1.0.0 Python helper encountered incomplete JSON reads through Muse’s VM
proxy during initialization and retrieval. Muse recovered with a temporary curl
transport, so the first review was not a clean package pass.

Version 1.0.1 selects curl before the first request when available and otherwise
uses urllib. It disables curl configuration files, follows no redirects, adds
no retries, bounds response size and time, preserves MCP session/protocol
headers, handles proxy CONNECT headers and retains the complete tool result
and guidance. No Python packages, credentials, hooks or background jobs are
required. An uncertain scan-creation result must never be replayed for transport
diagnosis.

The corrected ZIP was installed in Muse. Its own included helper directly ran
`--list-tools`, `certscore_get_scan_status`, and an 8,000-byte findings bundle
read for the existing scan. All three commands succeeded on the first attempt
with exit code zero, without older or temporary helpers. The report action and
`more_findings` follow-up were present in metadata and text guidance. The
follow-up correctly described reading retained evidence without a new scan.

The first review was too long and led with installation details. Updated skill
instructions prioritize three to five findings for broad review questions,
group related signals when helpful, keep setup details out of the opening, and
reserve the full inventory for the report or a requested deeper review. They
also distinguish “Reject was clicked” from separately confirmed registration.

A clean second chat used the saved skill and the same existing scan. Its deeper
follow-up returned all 18 retained inventory rows, including seven unique cookie
names, without creating a scan. The final wording pass replaced internal IDs
and tool terminology with plain-language priorities and the full-report link.
After the checklist and inventory follow-ups had already been used, Muse did
not repeat another promotional offer. The final package was saved in Muse,
which confirmed that the helper bytes were unchanged by the copy polish.

## Release scope and cost

Publish the 1.0.1 ZIP and update the web guide, Markdown guide and discovery
links. Keep the older versioned asset available. No MCP service, database,
scanner or infrastructure-capacity change is needed.

Local validation includes eleven offline transport regressions, skill
frontmatter validation, archive/source parity, a live tool listing, and the
change-aware web gate. Curl regressions cover proxy headers, sessions, guidance,
429, redirects, size bounds, timeouts and no request replay.

The ZIP is approximately 9.4 KB. Estimated transfer at 100,000 downloads/month
remains below $0.25/month; the increase from the prior ZIP is approximately
$0.02/month. No automatic scans, extra model calls or recurring jobs are added.
