# Scan-quality calibration pilot: 10-site review

Run date: 2026-07-17 UTC  
Profile: `full`  
Pilot list: [scan-quality-calibration-pilot-10.txt](./scan-quality-calibration-pilot-10.txt)

This is an internal calibration record. It does not promote v2 artifacts into production findings, scoring, checklist rows, or customer-facing report output.

## Outcome

The pilot completed 10/10 requested runs with no run-level failures and no silently empty completed runtime. After verifier classification was corrected, the pilot verification passed. It still carries explicit warnings for intentionally disabled post-consent coverage, one expected no-go, and one headed fallback.

| Measure | Result | Interpretation |
| --- | ---: | --- |
| Completed runs | 10/10 | Cohort execution was reliable at the run level. |
| Pre-consent tracking observed | 9/10 | Runtime evidence is being retained on normal reachable sites. |
| Third-party cookies before consent | 8/10 | Cookie evidence is present often enough to exercise the lane. |
| Session replay / behavioral analytics | 3/10 | Vendor and behavior attribution needs a larger sample before setting a baseline. |
| Confirmed no-go candidate | 1 | `ftc.gov` returned access-denied evidence and is treated as an expected no-go control; its downstream resolver skip is excluded from the critical failure budget and remains visible as a warning. |
| Runtime coverage limited | 10/10 | Expected because post-consent interaction is intentionally disabled; this is a declared coverage limitation. |
| Headed fallback | 1 | `fidelity.com` completed after a headless navigation timeout; reliability follow-up required. |

All reachable sites retained a core policy surface and positive transport-security observations. The pilot also retained screenshots, consent geometry artifacts, policy-surface diagnostics, transport observations, and review results for evidence-level inspection.

## Findings from the evidence review

### Consent controls

- `cnn.com`, `plannedparenthood.org`, and `fullstory.com` retained visible first-layer accept evidence.
- The pilot did not consistently retain first-layer reject or options controls. `cnn.com` is a useful example: the screenshot contains the consent surface and the geometry summary confirms accept, but reject/options were not retained as actionable first-layer controls.
- `theguardian.com`, `walmart.com`, `booking.com`, `notion.so`, `fidelity.com`, and `cloudflare.com` had CMP or privacy-choice evidence but no retained first-layer actionable controls in the geometry summary. These should be reviewed as discovery/visibility gaps, not automatically treated as proof that the site lacked controls.
- `privacy_opt_out` / “Your Privacy Choices” evidence must remain distinct from first-layer GDPR/ePrivacy reject availability.

### GDPR transparency

- Reachable sites retained policy surfaces and GDPR topic candidates, generally with English locale matches.
- `ftc.gov` had no policy surface because the homepage was blocked; the correct result is limited/no-go coverage, not a transparency pass or a synthetic not-testable row.
- The next calibration step should compare topic-level evidence coverage, not only whether a privacy-policy URL exists. The target is explicit evidence for controller/contact, purposes, legal basis, recipients, retention, rights, transfers, DPO/contact, and supervisory-authority complaint.

### Transport security

- All 10 pilot artifacts retained a typed transport observation.
- Nine sites showed positive HTTPS/TLS/redirect signals without mixed content or insecure forms.
- `plannedparenthood.org` did not retain an HTTP-to-HTTPS redirect observation; this is the clearest transport follow-up in the pilot.
- `fullstory.com` retained mixed-content evidence and should remain an important regression fixture.

### No-go handling

- `ftc.gov` demonstrated the desired no-go evidence path: 403/access-denied evidence, corroborating no-go reasons, zero vendor observations, and limited runtime coverage.
- The verifier currently counts the skipped `vendorResolver` on this expected no-go as a critical module failure. That is a verifier policy mismatch, not evidence that the no-go detection is wrong. Future verification should distinguish expected no-go module skips from unexpected module failures.

### Language inference

- The pilot artifacts expose document-language and matched-locale signals, but not a single durable primary-language decision in the v2 review artifact.
- Several sites expose `en`, `en-US`, or `en-us`; these should normalize to a canonical `en` primary-language guess with provenance and confidence.
- Language should be evaluated as a confidence-ranked inference from document language, policy language matches, consent UI language, and page-content language—not as a display-only guess.

## Required follow-up before 50-site baseline promotion

1. Add an explicit cohort review stage to verification and preserve `ReviewResult.json` for every completed bundle. The runner now creates this artifact automatically when it is absent.
2. Verifier semantics now distinguish corroborated no-go downstream skips from unexpected critical module failures; keep this behavior covered as the no-go cohort expands.
3. Investigate consent geometry false negatives for detected CMPs, especially Guardian/Booking/Notion/Fidelity/Cloudflare, using retained screenshots and bounded inventory evidence.
4. Investigate the Fidelity headless timeout and preserve the headed-fallback signal in calibration reporting.
5. Add a canonical primary-language inference artifact with source signals, normalized language, and confidence, then include it in the language lane baseline.
6. Re-run the 10-site pilot after these changes. Only then promote lane expectations to the 50-site calibration registry.

## Reproduction

```bash
pnpm v2:calibration-registry-check
pnpm v2:wc01-scan-lab-cohort -- --urls docs/certscore-v2/scan-quality-calibration-pilot-10.txt --profile full --limit 10 --out-dir artifacts/v2-scan-quality-calibration-pilot
pnpm v2:wc01-verify-scan-lab-cohort --summary artifacts/v2-scan-quality-calibration-pilot/Wc01V2ScanLabCohort.summary.json --min-sites 10 --out-dir artifacts/v2-scan-quality-calibration-pilot/verification
```
