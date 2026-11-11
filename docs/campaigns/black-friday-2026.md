# CertScore.ai Black Friday 2026 implementation and launch guide

Implemented locally on November 10, 2026. **Not deployed. No real campaign email, payment transaction, subscription modification, AWS scan or production migration was performed.** The existing deployment hold remains in effect.

## Routes

| Purpose | Route |
|---|---|
| Public offer | `/black-friday` |
| Separate application | `/black-friday/apply` |
| Personal invitation / account handoff | `/black-friday/activate` |
| Protected application table | `/app/admin/promotions/black-friday-2026` |
| Protected funnel | `/app/admin/promotions/black-friday-2026/dashboard` |
| Preferred short admin URLs | `/admin/promotions/black-friday-2026` and `/admin/promotions/black-friday-2026/dashboard` redirect to the existing protected admin area |

The landing page uses the existing navigation, footer, plan catalog, canonical metadata and social image. The landing page leads with a client privacy review: capture a baseline, inspect supported choice paths, and retest after a change. The campaign links to [California Civil Code § 1798.136](https://cppa.ca.gov/pdf/20260101_ccpa_statute.pdf#page=19) and the [UK ICO’s storage and access technologies guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) for examples of regulatory developments a client team can prepare to review. Custom-only API and white-label capabilities are explicitly excluded.

## Storage and migration

Apply `packages/db/migrations/0210_black_friday_2026.sql` through the repository's existing ordered AWS migration workflow before starting the new web version. It adds nine private tables:

- `promotion_campaigns`: fixed campaign window and ten-place capacity.
- `promotion_applications`: required/optional application details, consent/terms version, attribution, status, business group, numbered allocation, linked user/workspace and entitlement dates.
- `promotion_audit_log`: actor, timestamp and administrative/activation action.
- `promotion_events`: idempotent application-linked operational milestones.
- `promotion_email_outbox`: durable notifications, attempts, lease, acceptance/failure/uncertain outcomes.
- `promotion_aggregate_events`: daily Pacific anonymous view/start totals and coarse source group.
- `promotion_request_receipts`: 30-minute transport deduplication; no persistent visitor identity.
- `promotion_rate_limits`: keyed, hourly abuse counters, purged after a day.
- `promotion_usage`: three atomic monthly page allowances.

All use RLS without anonymous policies, matching private service-side SQL access. Migration adds effective-plan/calendar helpers and scan-insertion, completed-scan and paid-subscription event triggers. No historical reports or paid subscription records are rewritten. Roll forward through the normal migration process; do not drop entitlement tables while any allocation is active.

The release also includes migration 0211. It verifies that no account bans or impersonation sessions remain in the retired authentication fields and prevents new values during rollout. If it fails, review those records before promotion. After the previous web tasks have drained and rollback to the previous revision is no longer needed, run `packages/db/maintenance/remove-retired-auth-admin-columns.sql` to drop the five retired fields. Earlier web revisions require these fields. Keep the applied migration files for checksum validation.

## Application, review and email workflow

1. A complete, valid application is persisted together with `bf26_form_submit` and owner/applicant outbox rows in one database transaction. Email delivery runs afterward. Anonymous application responses do not expose duplicate record IDs.
2. Email/domain normalization, a unique request UUID, one application per registrable business domain/email, a honeypot, bounded input, same-origin enforcement and database rate limits protect intake. Solo businesses using a consumer email are not automatically excluded. Website verification is manual; intake never fetches applicant URLs.
3. Administrators use the existing email-based platform-admin authorization. Review the company website and identity, relevant client services, existing subscription and common control. Record a stable business-group name and the verification attestation. Resolve earlier complete applications before approving later ones.
4. Approval locks the campaign row, reserves one unique slot from 1–10 and starts the 14-day invitation deadline. Allocations are never silently recycled after expiry. Approval and invitation enqueueing are atomic. Double clicks/concurrent requests cannot allocate an eleventh place.
5. The invitation URL carries a domain-separated HMAC credential in its fragment. The activation page removes the fragment and exchanges it for an HttpOnly/SameSite cookie. Invitation analytics are disabled. The applicant signs in or creates a normal account using the invitation email, then explicitly activates. The account handoff has campaign-specific copy rather than advertising the seven-day trial.
6. Activation rechecks the signature, current invitation revision, email, deadline, workspace eligibility and previous redemptions in a transaction. Existing paid and Marketplace workspaces are excluded. No Stripe call is made.
7. Owner notifications go to `ben@certscore.ai`. Applicant emails cover receipt, invitation/approval, rejection, activation and the final seven days of access. Marketing opt-in is stored separately; it does not trigger a campaign marketing send.

The existing Gmail transport/sending identity is reused. An immediate post-response attempt is followed by a five-minute maintenance loop in the existing long-running AWS web process. PostgreSQL leases and `SKIP LOCKED` protect multiple web replicas. No additional queue service, cron deployment, worker capacity or paid provider is introduced.

Delivery failures remain visible in the admin table. Safe pre-SMTP failures retry, up to five attempts. Ambiguous SMTP outcomes become `uncertain` and are not retried automatically. Inspect actual mailbox/provider delivery before deliberately resending an invitation. Resending rotates the credential and does not extend the original deadline. The admin action can process pending mail and retry known failures; it does not blindly retry uncertain mail. SMTP acceptance means accepted for delivery, not guaranteed inbox arrival.

## Entitlements and accounting

The base organization plan stays unchanged (`free` for eligible recipients). A private effective-plan overlay exposes ordinary Pro features only while the entitlement is active. The promotion never creates or modifies Stripe subscriptions, prices, invoices or payment methods. A voluntary paid upgrade remains an explicit existing checkout action and takes precedence.

The three-month term uses UTC calendar anniversaries from activation, clipped to the final day of shorter months without drifting later anniversaries. Each anniversary starts a new 1,000-page allowance; unused allowance does not roll over. The public application window is separately evaluated in Pacific time: November 10 at 00:00 through December 2 at 23:59:59.999, closing at `2026-12-03T08:00:00Z`. A nonproduction-only test switch can bypass the public date window, never capacity or activation rules.

Ordinary v2 scans consume one starting-page scan, consistent with the existing product. Their legacy `pages_requested` plan/reuse ceiling is not charged as multiple dispatched pages. An explicitly authorized full-site resource crawl reserves its validated maximum page budget. Requests count toward the allowance even if they subsequently fail or use fewer reserved pages. The existing scan rate, authorization, DNS/public-network and capture guards remain in place. The database scan-insertion boundary serializes allowance consumption; stale browser plan state cannot extend access or overspend the allowance under concurrent requests.

Expiry takes effect on entitlement/dispatch reads and in the database guard, without depending on an email timer. The account stays nonpaid, with an explicit upgrade link. Historical reports remain untouched. The maintenance loop updates stored expired statuses and queues approaching-expiration notifications.

## Measurement and limitations

- Anonymous `bf26_landing_view` and `bf26_form_start` counts are document-level aggregates. Hydration/repeated focus are deduplicated in memory; short-lived transport IDs deduplicate retries. Refreshes are new page documents. **Unique visitors and cross-refresh visitor conversion are unavailable**, not estimated using cookies or fingerprints.
- No campaign tracking cookie, persistent actor ID or session replay is added. Current-page attribution is bounded, sanitized and retained in memory across the form navigation only with analytics consent. GPC overrides prior granted consent on campaign pages. Server intake also honors `Sec-GPC: 1`.
- Application-linked submit, approve, reject, successfully sent invitation and activation events are operational records. First scan derives from the authoritative completed scan row; paid conversion requires the existing active paid subscription/payment state. Each application milestone is unique. No browser event can claim a paid conversion or completed scan.
- Date-range event totals count when events occurred. Cohort conversion rates follow applications submitted in that range through their current outcomes. The dashboard labels these different denominators; anonymous activity ratios are not visitor conversion rates and can exceed 100%.
- Source groups include LinkedIn, X, Termageddon, Email, Direct/unknown and Other. Refused/missing consent, GPC, direct form entries, refreshes, blocked JavaScript, rate limits and interrupted navigation limit acquisition attribution. Raw form values never enter the campaign analytics payload.
- Daily tables include zero-activity days. CSV output escapes formula injection. Admin visibility and CSV are authorized server-side independently of the page navigation.

## Environment and launch prerequisites

Reuse existing `DATABASE_URL`/database settings, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`, public-account-creation/access controls and `CERTSCORE_ADMIN_EMAILS`. No new provider key is required. This implementation did not inspect production credentials or verify live inbox delivery.

New switches, documented in `apps/web/.env.example`:

| Variable | Default | Use |
|---|---|---|
| `CERTSCORE_BF26_EMAIL_DELIVERY` | `0` | Set `1` only in the approved environment to enable real transactional delivery and the existing-web-process maintenance loop. |
| `CERTSCORE_BF26_TEST_WINDOW` | `0` | Local previews only. Ignored in production. Does not waive capacity, identity or quota enforcement. |

Before launch:

1. Resume deployment authorization, then prepare an isolated reviewed release containing this campaign and its dependencies. The shared WC01 working tree contains substantial unrelated changes; do not deploy it indiscriminately.
2. Run the ordinary repository release/build gates and apply migration 0210 before the new web image. No new AWS service/capacity is required.
3. Confirm `NEXT_PUBLIC_APP_URL=https://certscore.ai`, the existing Gmail verified sender, admin authorization and applicant account creation/access policy. Make sure applicants can use the existing account-creation path; an auth allowlist can otherwise prevent activation.
4. Set delivery to `1` for launch. Keep the test-window override off. The production date gate is mandatory. Public pages fail closed if the database is unavailable.
5. Review final campaign terms and operational retention against the existing privacy notice. The page makes no legal-compliance certification claim.
6. After all entitlements and queued messages are settled, disable campaign delivery/maintenance. Do not remove records or entitlements as a cleanup shortcut.

Small campaign records, transactional emails and maintenance on existing fixed-capacity infrastructure are estimated below $1/month incremental at the expected small campaign volume, excluding scan execution. This is a planning estimate, not billing. The explicitly requested promotion grants at most 30,000 page-scan slots across ten recipients and three periods. Actual scan execution uses existing variable-cost infrastructure and should be included in the owner's scan budget; no additional capacity or paid API/model use was introduced by campaign administration.

## Local test and operator walkthrough

Use an isolated local database with the normal schema plus migration 0210, never a production database URL. Keep real delivery disabled and use the mock transport in tests.

1. Open `/black-friday`, then `/black-friday/apply`. Enter a test business, leave marketing permission unchecked, accept terms and submit. Confirm the success message. Verify `received` and `owner` outbox records; the latter is addressed to `ben@certscore.ai` by the email renderer.
2. Sign in as an existing platform admin. Open the application table, inspect details, record review notes and business group, attest verification, then approve. Confirm one allocated spot and one pending invitation.
3. For a local walkthrough, use mocked delivery to mark invitation acceptance. Open the signed test invitation, create/link the matching test account and activate. Verify the base plan remains free, the effective plan is Pro, and the end is exactly three calendar months later. No credit card or Stripe subscription is involved.
4. In the automated walkthrough, a local scan fixture is marked completed to test `bf26_first_scan`; it never dispatches a scanner. A future authorized live user scan can verify the production event chain after launch.
5. Inspect the funnel and application detail/outbox. Verify submit → approved → invitation sent → activated → first scan, and the independent anonymous landing/start aggregates. Test rejection, failed delivery and expired invitations separately.
6. **To receive a real alert at `ben@certscore.ai` after launch**, enable delivery in the approved environment and submit a real test application through that environment. Inbox receipt is a manual launch verification; no real email was sent during these tests. Do not count a test allocation as a real customer slot without an explicit data-handling decision.

Verification receipts, screenshots and reproducible local browser scripts are under `outputs/black-friday-2026/`. Tests use an isolated local PostgreSQL schema and mock SMTP/billing. The browser walkthrough covers desktop/mobile, validation, application persistence, unauthorized/cross-origin rejection, protected review/CSV, invitation activation and simulated first scan. Axe checks exclude only the existing wordmark under the WCAG logotype contrast exception; campaign footer contrast is corrected locally.

## Files delivered

Created:

- `apps/web/app/(marketing)/black-friday/activate/page.tsx`
- `apps/web/app/(marketing)/black-friday/apply/page.tsx`
- `apps/web/app/(marketing)/black-friday/page.tsx`
- `apps/web/app/admin/promotions/black-friday-2026/dashboard/page.tsx`
- `apps/web/app/admin/promotions/black-friday-2026/page.tsx`
- `apps/web/app/api/admin/promotions/black-friday-2026/route.ts`
- `apps/web/app/api/promotions/black-friday/activate/route.ts`
- `apps/web/app/api/promotions/black-friday/applications/route.ts`
- `apps/web/app/api/promotions/black-friday/events/route.ts`
- `apps/web/app/api/promotions/black-friday/invite/route.ts`
- `apps/web/app/app/admin/promotions/black-friday-2026/dashboard/page.tsx`
- `apps/web/app/app/admin/promotions/black-friday-2026/page.tsx`
- `apps/web/components/promotions/campaign-activation.tsx`
- `apps/web/components/promotions/campaign-admin.tsx`
- `apps/web/components/promotions/campaign-form.tsx`
- `apps/web/components/promotions/campaign-tracking.ts`
- `apps/web/instrumentation.ts`
- `apps/web/lib/promotions/black-friday.ts`
- `apps/web/server/promotions/aggregate.ts`
- `apps/web/server/promotions/black-friday.test.ts`
- `apps/web/server/promotions/config.ts`
- `apps/web/server/promotions/dashboard.ts`
- `apps/web/server/promotions/email.ts`
- `apps/web/server/promotions/entitlement.ts`
- `apps/web/server/promotions/http.ts`
- `apps/web/server/promotions/maintenance.ts`
- `apps/web/server/promotions/repository.ts`
- `docs/campaigns/black-friday-2026.md`
- `packages/db/migrations/0210_black_friday_2026.sql`

Modified integration points:

- `apps/web/.env.example`
- `apps/web/app/app/admin/layout.tsx`
- `apps/web/app/app/layout.tsx`
- `apps/web/app/sitemap.ts`
- `apps/web/components/auth/login-form.tsx`
- `apps/web/components/layout/site-footer.tsx`
- `apps/web/lib/analytics/consent-bootstrap.ts`
- `apps/web/lib/analytics/consent-bootstrap.test.ts`
- `apps/web/lib/analytics/consent.ts`
- `apps/web/lib/product-analytics/client.ts`
- `apps/web/server/dashboard/get-dashboard-scan-usage.ts`
- `apps/web/server/scans/create-full-scan.ts`
- `apps/web/server/scheduling/repository.ts`
- `apps/web/server/users/repository.ts`
- `apps/web/server/pulse/lifecycle-persistence.test.ts`

The DNS regression test assertions were aligned with the existing pre-reuse guard and dynamic error classification. This does not change DNS validation behavior.
