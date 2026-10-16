# Cookiebot bounded inventory capture

Local implementation, October 15, 2026. Production deployment is not authorized
by this change.

`cmp_preferences.v11` uses the canonical Cookiebot registry definitions for two
read-only captures after the existing single authorized Customize action:

* `cookiebot_inline_categories.v1` binds each styled switch to its unique native
  checkbox, exact accessible heading, original category and verified Details
  panel. A visible, unobstructed registered sibling can establish the switch's
  presence when the native input is transparent. Hidden, offscreen, covered,
  ambiguous or mismatched controls fail closed. Checked state comes from the
  native input. No switch is activated.
* `cookiebot_loaded_declarations.v1` reads public declaration cards already
  loaded under that same original panel. Collapsed cards remain collapsed.
  These are `cmp_loaded_inventory` facts, distinct from visible inventory and
  vendor API configuration. Exact Type fields distinguish HTTP cookies from
  local storage, IndexedDB and pixels. Only explicit HTTP cookie records enter
  the cookie declaration comparison. The renderer's bracketed aggregate count
  is removed from the declared name; arbitrary cookie templates are not expanded.

Provider identity comes from the same card's explicit provider heading. Nested
domain lists are not flattened into provider names. Projection reuses the shared
explicit-provider rule to exclude domains, categories and unavailable markers.
Names, purposes and durations are literal declarations, not canonical cookie
purpose classifications or proof of runtime use.

The capture retains at most 100 records and 16,000 text characters within the
existing preference deadline. It respects room already used by visible
declarations. A truncated or malformed sample remains partial. Even an
untruncated loaded-DOM sample cannot establish the CMP's complete configured
inventory. Missing declarations cannot be inferred from it.

The typed packet requires a verified opened panel, exact document checkpoint,
Cookiebot provider, versioned extraction, exact declaration projection and a
false completeness flag. Navigation invalidation clears the capture. Canonical
assessment policy `cmp_inventory_tables.v12` consumes the retained packet through
normalized concerns, concern policy and the existing checklist/report projection.
Service names and cookie details can be assessed from this bounded source;
their presence does not claim that each card was visible or its controls tested.
Inventory coverage itself adds no scoring effect.

The accompanying Reject repair classifies an instrumented cookie write against
its resolved retained identity domain. Previously, a write from a `www` document
to a parent-domain cookie could retain the parent identity with a classification
bound to the document host. The strict exact-domain contract correctly rejected
that mismatch. The repair changes the producer, not the guard, action policy,
cookie-purpose registry or scoring weights.

No lane, action, retry, model call, standing capacity or time allowance is added.
Estimated incremental bounded metadata storage and processing is below $1/month
at 100,000 scans/month with 30-day retention. Targeted local verification uses
the existing Ireland proxy and is estimated below $1 in total. Historical
reports and source artifacts remain unchanged.
