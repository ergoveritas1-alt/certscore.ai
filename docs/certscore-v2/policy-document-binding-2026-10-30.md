# CertScore.ai policy-document witness binding — October 30, 2026

The next policy-content priority is source identity. Retrieval failures in the
retained sample do not justify new retries or relaxed policy evidence gates.
Inspection found a concrete weakness in the existing topic adapter's witness
join: it compared hostname and path while removing www, ignoring scheme, port
and query, and treating trailing slashes as equivalent. Different policy
revisions or query-selected documents could therefore share a retained witness.

The adapter now uses `policy_document_identity.v1` for retained-witness reuse.
It compares complete parsed HTTP(S) document URLs, preserving query, scheme,
non-default port, hostname and exact path. URL-parser normalization of hostname
case and default ports remains valid. Section fragments identify the same fetched
document. Invalid, relative or credential-bearing URLs cannot establish a join.
Aliases and redirects need independent source proof; the comparison invents none.

The eligibility adapter still requires a fetched, usable, target-relevant privacy
policy and a substantive row-specific witness. A mismatched witness cannot rescue
an inadequate candidate. A substantive candidate from the current document
continues independently through the original classifier path. This does not
weaken quality, ownership or source-content requirements and adds no display
fallback, finding shortcut or scoring-weight change. Bound signals retain the
identity policy marker in their bounded classifier provenance.

Tests use Dolby's original SHA-labelled contact witness and altered document
identities to reproduce the unsafe fuzzy-join case. Exact-source and fragment
joins remain valid; query/scheme/port/alias/path changes cannot rescue the weak
candidate. Further cases cover invalid URLs, credential-bearing URLs, default
ports, query ordering and independently substantive candidate evidence.

All 46 focused tests and the focused web/test typecheck pass. Local replay
SHA-verifies twelve original bundles and preserves all 39 strong source-document
joins. No historical source mix-up or fleet impact is claimed from that replay.
It establishes compatibility for the retained joins and a regression for the
previously permissive comparison.

Local paid usage is $0. No new fetch, retry, wait, scan, public visit, cloud query,
model/API call, deployment, capture-budget increase or historical rewrite was
performed. Marginal deterministic comparison/provenance cost after a separately
authorized deployment is estimated below $0.01/month at 100,000 scans. Existing
services and retention allowances remain unchanged. Audit dashboard source pins
remain unchanged; no dashboard was repinned or published.
