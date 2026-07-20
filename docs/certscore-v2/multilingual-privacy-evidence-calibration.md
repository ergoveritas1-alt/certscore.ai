# 40-locale privacy-evidence calibration

`pnpm v2:multilingual-gold` is the deterministic release gate. It uses an independent, human-reviewed 40-locale corpus and verifies localized privacy/cookie surfaces, accept/reject/options/necessary-only classification, browser geometry retention, retained screenshot references, and generic-page negative controls. It does not make Article 13/GDPR-transparency claims beyond the separately calibrated thirteen locales (`en`, `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt`, `ru`, `ja`, `zh`, `ar`, and `sv`).

For live calibration, maintain a reviewed manifest with one or more screenshot-backed targets per locale. Each target declares whether privacy/cookie surfaces and accept/reject/options are expected. After retaining the production scan artifacts, run:

```bash
pnpm v2:multilingual-live-calibration -- \
  --manifest ./artifacts/multilingual-live/targets.json \
  --artifact-root ./artifacts/multilingual-live \
  --strict
```

The command is artifact-only and never clicks a consent control. `--strict` fails only reviewed, expected evidence that was not retained; access blocks and missing artifacts remain explicit report rows instead of false negatives.

Every registry addition or phrase change should add a deterministic gold value and a reviewed live target before release. Public-site drift makes the live cohort diagnostic rather than a general CI blocker.
