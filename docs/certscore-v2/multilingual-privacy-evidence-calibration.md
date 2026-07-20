# 40-locale privacy-evidence calibration

`pnpm v2:multilingual-gold` is the deterministic release gate. It uses an independent, human-reviewed 40-locale corpus and verifies localized privacy/cookie surfaces, accept/reject/options/necessary-only classification, browser geometry retention, retained screenshot references, and generic-page negative controls. It does not make Article 13/GDPR-transparency claims beyond the separately calibrated twenty-nine locales (`en`, `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt`, `ru`, `ja`, `zh`, `ar`, `sv`, `ro`, `cs`, `el`, `hu`, `da`, `fi`, `sk`, `bg`, `hr`, `nb`, `sl`, `lt`, `lv`, `et`, `uk`, and `tr`).

For live calibration, maintain a reviewed manifest with one or more screenshot-backed targets per locale. Each target declares whether privacy/cookie surfaces and accept/reject/options are expected. After retaining the production scan artifacts, run:

```bash
pnpm v2:multilingual-live-calibration -- \
  --manifest ./artifacts/multilingual-live/targets.json \
  --artifact-root ./artifacts/multilingual-live \
  --strict
```

The command is artifact-only and never clicks a consent control. `--strict` fails only reviewed, expected evidence that was not retained; access blocks and missing artifacts remain explicit report rows instead of false negatives.

Every registry addition or phrase change should add a deterministic gold value and a reviewed live target before release. Public-site drift makes the live cohort diagnostic rather than a general CI blocker.

## GDPR Transparency calibrated locales

The canonical GDPR Transparency classifier is independently calibrated for `en`, `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt`, `ru`, `ja`, `zh`, `ar`, `sv`, `ro`, `cs`, `el`, `hu`, `da`, `fi`, `sk`, `bg`, `hr`, `nb`, `sl`, `lt`, `lv`, `et`, `uk`, and `tr`. The expansion waves (`pt`, `ru`, `ja`, `zh`, `ar`, `sv`; `ro`, `cs`, `el`, `hu`, `da`; `fi`, `sk`, `bg`, `hr`, `nb`; then `sl`, `lt`, `lv`, `et`, `uk`, `tr`) have deterministic long-policy fixtures, reviewed grammatical and script variants, generic-text negative controls, owned passive canaries, and full classifier-to-checklist projection tests.

The reviewed owned-canary manifest is `docs/certscore-v2/gdpr-transparency-multilingual-live-canaries.json`. Its pages are no-index calibration surfaces on `certscore.ai`; they are not legal notices and do not create production findings by themselves. After deployment and passive scans have retained artifacts, audit them with:

```bash
pnpm v2:gdpr-transparency-live-calibration -- \
  --manifest docs/certscore-v2/gdpr-transparency-multilingual-live-canaries.json \
  --artifact-root ./artifacts/gdpr-transparency-live \
  --strict
```

The audit is artifact-only. It verifies privacy-policy fetch success, all ten canonical topics in the expected locale, and bounded retained excerpts. It does not click or otherwise interact with consent controls.
