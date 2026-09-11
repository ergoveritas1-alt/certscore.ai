# MCP response review columns

Adds Response, Agent next step, Retry, and Failure source immediately after Status in the admin MCP operations request table. Four filters cover response category, next step, failure source and captured/missing response summary. Pagination and both analytics-period forms preserve those filters.

All four columns use retained response summaries. Historical request outcomes, current scan snapshots and current guidance are not used to invent missing responses. Absent or unsupported capture is Not recorded. Success/pending, limited scan, invalid request, execution failure and rate-limit categories remain distinct. Failure sources include captured upstream operations, validation/discovery, known scanner errors, canonical target-site limitation codes and explicit MCP rate limits.

Next-step labels come from the recorded next-tool field or recognized wording in retained safe guidance. Unrecognized or omitted instructions remain Not recorded. Retry displays a retained retry prohibition, delay, explicit new-scan requirement or retry permission; full messages, codes, operation context and capture limitations remain in Request details.

The database uses identical SQL expressions for displayed columns and filtering before pagination, avoiding client-side filtering or divergent UI classification. Values selected by the user are parameterized and validated against the fixed option registries.

Validation: local PostgreSQL integration test covering 12 response cases and filter/column agreement, including missing/malformed capture and deliberately conflicting legacy event state; eight focused admin tests; web typecheck and production build. The SQL integration test can run with MCP_REVIEW_TEST_PG_SOCKET and MCP_REVIEW_TEST_PSQL pointing to isolated local PostgreSQL on port 55484.

No new persistence, retention, network calls, scans, model calls or infrastructure. Existing request-count and page queries perform bounded JSON-field projection. Not deployed by this implementation.
