# CMP observed facts — assessment v6 / report v3

Owner-approved local implementation, October 14, 2026. No deployment authorized.

The narrower criteria distinguish captured facts from semantic consent registration:

- **Consent storage observed** reports a known CMP cookie retained in the final
  snapshot of a completed, source-bound choice observation. “Updated” requires
  the same retained cookie identity and different before/after value hashes;
  unchanged records are only “Stored.” Never expose values or infer the decision.
- **Activity after Accept / Reject** reports independently completed, validated
  paths via `choice_path_execution.v1`. Both v1 and v2 bounded after-click captures
  support factual coverage. Request counts, classifications and sanitized paths
  describe their own window; they do not prove consent enforcement. Incomplete,
  cancelled, foreign, malformed or uncertain paths remain limited/unassessed.
  The stricter v2 request-ancestry and semantic rules for findings/scoring are
  unchanged. Existing policy-evaluated Review results take precedence.
- **Cookie details** keep CMP-stated purpose/retention separate from the optional
  `canonical_cookie_registry.v1` inferred-purpose annotation. Unknown or
  context-dependent patterns stay unclassified. Inference never fills the CMP
  disclosure fields, upgrades disclosure completeness or manufactures services.
- Missing service identities receive a capture-specific explanation. They do not
  establish unsupported CMP functionality; cookie/vendor inference is not a
  substitute for a declared service identity.

The path remains verified producer bundle -> typed CMP assessment -> persisted
consent assessment -> normalized concern / concern policy -> shared report export.
New facts require assessment v6 / report v3. Historical v1–v5 assessments are
readable with their original scope; no automatic reassessment occurs on read.

A completed v3 Reject activity check replaces the older confirmed-only coverage
callout in Detailed Evidence and assessment highlights. The original checklist
assessment and confirmation remain retained. Existing Review findings are kept,
and the old evidence anchor routes to the current activity criterion.

There are no changes to scanner visits, loops, lanes, deadlines, waits, model/API
calls, action authorization, scoring, infrastructure or retention limits. Bounded
annotations reuse retained evidence within existing approved storage and compute
budgets; no additional budget or paid service is introduced. No live targets were
contacted for verification.

Local verification used IKEA scan `3da7c991-da4f-406b-9b3a-ed551490298a` with original
producer bytes verified against terminal SHA-256 metadata. Its local projection
was explicitly rematerialized using the canonical pipeline, with the previous
record backed up. Score (92), A/R/O, prominence, policy and accessibility
assessments were checked unchanged. Results: 10 Observed, 2 Partially assessed,
1 Not assessed (missing retained service identities). The underlying unconfirmed
consent decisions remain unconfirmed. API export, SDK reconstruction and MCP
pagination agree for CMP, policy and accessibility evidence.

Ignored verification artifacts: `artifacts/cmp-narrow-scopes-20261014/`.
