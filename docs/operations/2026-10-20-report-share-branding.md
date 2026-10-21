# CertScore.ai report sharing and workspace branding

## Changes

Remove the additional workspace logo/name banner and its separate white-label
PDF button from authenticated scan pages. Keep the application navigation,
report identity, assessment and existing Share menu.

All authorized PDF exports now use the authenticated viewer's configured
workspace logo, name and header theme automatically. Callers no longer need
to opt into `branding=workspace`. A workspace without a logo keeps the default
CertScore.ai header; an explicitly requested white-label export still requires
a logo. An unreadable configured logo fails with 409 instead of silently
discarding the custom header. Existing authentication, advanced-role access,
workspace scan authorization and viewer-workspace isolation remain enforced.

The owner chose lightweight email sharing rather than a new send-email form
or embedded/attached logo. The existing email link includes the online report
and, for PDF-authorized viewers, the same PDF endpoint used by Download PDF.
It states that sign-in and workspace access are required. That endpoint resolves
branding from the authenticated downloader's workspace, never a workspace ID
supplied in a URL or the scan owner's branding. It does not create an anonymous
branded PDF link or grant report access to an external email recipient.

## Verification

All 49 focused export, PDF, branding-isolation, email-content and Share-menu
tests pass, along with web typecheck and `git diff --check`.

On localhost, the retained ErgoVeritas test1 report has no extra workspace banner
or white-label button. Its email draft contains the PDF link and its normal
Share-menu PDF download contains the configured ocean logo and workspace name.
The downloaded PDF remains 24 pages, with score 28/100 and unchanged canonical
evidence and disclosure treatment. The cover is rendered and visually checked.
White/black header selection, no-logo fallback, unreadable logos, unauthorized
roles, inaccessible scans and cross-workspace isolation have route regressions.

The test download and cover preview are retained under `tmp/pdf-branding-follow-up/`.
No email was sent for this follow-up, no new scan was run, and no production
deployment or workspace setting change was made.

## Cost

This consolidates two existing PDF actions onto the existing custom-header
export path; it does not introduce a service, email attachment, model call or
retention change. A previously unbranded export with a configured logo now
performs the bounded logo read. Estimated extra S3 reads are approximately
$0.04 per 100,000 such exports. With the currently configured image, the measured
PDF increase is 84,911 bytes; allowing approximately $0.09/GB transfer yields
about $0.81/month for reads plus transfer at 100,000 previously unbranded exports.
This estimate is below the owner's $1 pre-approval threshold. Larger logos or
increased export volume require a new cost estimate before rollout when the
reasonably expected increase reaches that threshold. The owner declined the
separately proposed logo-embedded email path, estimated up to $3/month at 100,000
emailed reports; it was not implemented.
