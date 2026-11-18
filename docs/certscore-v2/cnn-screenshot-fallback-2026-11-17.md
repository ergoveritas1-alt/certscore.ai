# CertScore.ai CNN screenshot fallback repair

Local implementation only, November 17, 2026. No deployment, public-site visit,
production scan, flag change, worker-size change or historical rewrite.

## Retained diagnosis

Scan `e61f2c43-c628-4eff-b0b2-e56139ccf480` reached CNN with HTTP 200 in both
browser evidence lanes. The original canonical artifact and manifest were
retrieved by exact recorded pointers and verified against their retained byte
sizes and SHA-256 hashes. The canonical artifact hash was
`96b628f6de8b584709a7d026771ea89cf8ff6c3571275da27ad27db1b7d38827`.

The consent lane's early, settled and recovery screenshot checkpoints all failed
with CDP viewport timeouts. Their recorded durations were 3,001, 1,567 and 701 ms.
Only a placeholder was selected as the representative image. The runtime lane
intentionally skipped its selective screenshot. The policy lane's separate HTTP
403 limitation was not the trigger for the displayed visual-capture no-go.

The screenshot scheduler gave the initial CDP view attempt up to half of the
transaction, then let the CDP surface attempt consume all remaining time. The
actual Playwright viewport fallback was behind full-page capture; neither could
run after two CDP timeouts. In bounded-viewport mode the function returned a
placeholder without trying Playwright at all. A JavaScript timeout does not
cancel an already-dispatched Chromium screenshot command.

This establishes fallback starvation. It does not establish why CNN's Chromium
captures stalled, nor whether Playwright would have succeeded on that visit.

## Local change

For viewport-first transactions, preserve the first CDP attempt's existing cap,
limit the second to half the remaining allowance, then attempt a same-page
Playwright viewport before optional full-page work. Move the existing viewport
fallback rather than retrying it again after full-page work. Bounded-viewport
transactions also use the reserved viewport fallback and never attempt full-page
capture. The full-page-first schedule remains unchanged.

Playwright receives the remaining timeout and is additionally raced against that
allowance. It returns bytes without an artifact path; only an on-time result may
write the image. A late completion cannot overwrite a placeholder or a newer
capture. No new page/context/navigation, privacy action or runtime-lane screenshot
is introduced. Existing document/loader binding and screenshot safety review are
unchanged. Terminal page/browser errors still stop capture. If every method fails,
the placeholder remains explicit and the visual-verification gate remains intact.

All screenshot transaction deadlines, module/scan caps, worker sizes and retention
policies remain unchanged. This reallocates existing capture time; it adds no
configured recurring infrastructure or per-scan allowance. Actual production cost
and CNN recovery have not been measured.

## Verification

85 focused tests passed:

- 60 screenshot transaction/reserve and no-go assessment tests, including real
  Chromium with both borrowed CDP capture paths stalled. The actual Playwright
  fallback retained a 640×480 PNG in the original 3,000 ms allowance, on the same
  loader and URL. External requests were blocked in that fixture.
- 20 document capture, screenshot binding and paired-geometry tests, including
  unknown/changed loader, changed URL, post-consent and safety-withheld evidence.
- Five scanner integration fixtures covering soft module deadlines, parent
  cancellation, representative negative proof and same-document fallback.

The three paired-geometry browser tests initially encountered macOS sandbox
launch denial; all three passed when rerun with local browser execution allowed.
Scan-core TypeScript and `git diff --check` passed. The new reserve regression
suite is included in the existing CMP initialization predeploy check. No full
release-suite pass or live CNN recovery is claimed.

Existing unrelated Amazon.de local work was preserved.
