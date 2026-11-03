# CertScore.ai local OneTrust GPC receipt reader

The owner approved the local-only receipt-reader proposal in this chat. It
reuses already-loaded data, remains internal and score-neutral, and authorizes
no public scans, publication, deployment or sale/sharing settings projection.
Implementation base: dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`.

## Implemented boundary

`packages/certscore-scan-core/src/local-onetrust-gpc-receipt.ts` is a CPU-only
reader with no browser, network, file, SDK or paid-service operation. There is
no production caller or public export. Existing scan/report contracts, canonical
findings, scoring, statuses, cache versions and historical reads are unchanged.
The regression suite enters the existing GPC predeploy check.

The caller must supply the original bytes/length/SHA-256 receipt of a private,
already-loaded checkpoint and an independent expected scan/lane/session/document
binding. The private input envelope is `certscore.onetrust-receipt-input.local.v1`;
it requires compact canonical JSON to reject duplicate/escaped-alias envelope
fields. It is ephemeral input, not a request to retain raw cookies or add this
envelope to scanner artifacts. Synthetic fixtures create their original bytes
and pointers together. No historical receipt is rewritten or reconstructed.
A future caller must reuse an existing read and independently retained binding;
if those are absent, no result is available. No such caller is enabled here.

Before parsing, enforce the 16,384-byte input cap, original length and hash.
Strict input schema bounds cookies to 16 and values to 2,048 characters. Reject
scan, lane, session, loader, URL-hash, commit/read/freeze-time mismatches and
before/after navigation. Require HTTPS and one applicable, unexpired, secure,
unpartitioned canonical OneTrust cookie within the same registrable domain and
cookie path. Multiple matching cookies remain ambiguous. Unknown envelope fields,
unsupported versions, duplicate/case-variant/encoded duplicate receipt keys,
malformed encoding, missing/non-binary flags and conflicting flags omit output.
Inputs over bounds are omitted rather than silently trimmed to improve coverage.

Initial supported version is exactly `202303.1.0`, from OneTrust's documented
cookie example. This is deliberate conservative local scope, not a statement
that other versions are invalid. Broader version support requires reviewed
source semantics and fixtures.

The output `certscore.onetrust-gpc-receipt.local.v1` contains original source
hash, scan ID, SDK version, relative observation time and two boolean facts:
`browserGpcFlag` and `gpcCategoryFlag`. It enforces internalOnly=true,
productionProjectable=false, scoreEffect=none, and sale/sharing/honoring all
not_assessed. Output schema is strict and capped at 768 serialized bytes.
It retains no raw receipt, value hash, receipt identifier, group ID, location,
URL/path/query, cookie identity, session ID or document token.

## Meaning and limits

[OneTrust Cookies](https://docs.onetrust.com/en/consent--preferences/cookie-consent/managing-cookie-scripts-cookie-blocking-and-technical-implementation/onetrust-cookies)
documents browserGpcFlag as browser active/inactive, and isGpcEnabled as a
combined browser/category configuration flag. A zero combined flag does not
establish lack of receipt, disabled site-wide GPC support or an opt-out failure.
A positive category flag with a negative browser flag is omitted as conflicting.
These facts establish neither a separate sale/sharing choice nor honoring.

[GetDomainData](https://developer.onetrust.com/onetrust/docs/javascript-api)
returns configuration. Cookie-category consent cannot establish either axis
without separately reviewed, property-specific semantics. The existing GPP-only
public packet and measured/full-context comparison gates are untouched.

CNN's retained public/canonical artifacts lack these exact receipt inputs.
This helper cannot recover them from sanitized cookie hashes, another lane,
CMP identity, visible acknowledgment or the merged GPC state. No CNN or other
public visit was performed; real-site applicability remains unverified.

## Verification and measurement

Under the existing local-only test network guard:

```
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx --test --test-concurrency=1 packages/certscore-scan-core/src/gpc-impact-assessment.test.ts packages/certscore-scan-core/src/gpc-cmp-state-comparison.test.ts packages/certscore-scan-core/src/local-onetrust-gpc-receipt.test.ts
pnpm --filter @certscore/scan-core typecheck
git diff --check
```

28 focused regression tests passed, zero failures/skips, including eight new
reader tests with deterministic adversarial variants. Typecheck and diff check
passed. Fixtures cover valid independent flags, malformed/conflicting/duplicate
fields, wrong bytes/size/hash, identity and timing mismatches, document change,
unknown versions, expired/partitioned/ambiguous cookies, public-suffix scope,
redaction, schema promotion rejection and maximum output bounds.

The representative synthetic input is 698 bytes; output is 417 bytes. A local
1,000-iteration warm CPU measurement recorded median 0.018084 ms and p95
0.032833 ms including hash/schema/field parsing. These are local measurements,
not Lambda performance or production coverage. Exact log:
`outputs/gpc-coverage-audit-2026-11-02/onetrust-regression-tests.log`.

Adversarial review also checked that only tests reference the reader, the schema
cannot promote production eligibility or infer settings/honoring, inputs cannot
replace their own expected binding, and original historical sources are not
modified. No application build or full preflight was needed for this isolated
internal helper; no public API/SDK/MCP contract was changed.

## Cost and release

Actual production increment is zero bytes, zero processing and $0/month because
no production caller is enabled. A future two-lane caller must be reviewed and
measured separately. At the hard 768-byte output cap, 100,000 scans and 30-day
retention, raw extra storage would be 153.6 MB before duplication; reserve
$0.25/month combined processing/storage inside the existing $8 envelope using
the earlier 10 ms/lane planning ceiling. This remains an estimate, not measured
Lambda savings or authorization to add reads or increase budgets.

No configured infrastructure change, migration, public export, capture, new
packet publication or historical backfill is introduced. Future canonical/public
integration requires its own review, with compatible consumers before producers
through repository AWS workflows. Nothing was pushed, published or deployed.
