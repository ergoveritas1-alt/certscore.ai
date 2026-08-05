# A/R/O likelihood human review

This workflow creates a read-only, blind human-review packet for calibrating a
future Accept/Reject/Options likelihood policy. It does not queue scans, update
production records, or change the canonical consent-control projection.

## Cohorts

- Calibration: 29 category-diverse scans with unknown A/R/O fields. Explicitly
  pinned regression scans are retained first.
- Random holdout: 50 deterministic hash-ranked scans from unique domains not in
  calibration.
- Challenge holdout: 20 category-diverse unknown scans excluded from the other
  cohorts.
- Pilot: six cases selected from calibration, with the first pinned regression
  scan retained and the remaining cases diversified by failure category.

The production source query is read-only and bounded to 1,500 completed scans
from the configured lookback window. The generated source snapshot makes later
packet regeneration reproducible without another production query.

## Review protocol

1. Label the retained first-layer evidence as `present`, `absent`, `delayed`, or
   `unverifiable` for A, R, and O.
2. Open the site in a clean private session and perform a passive first-layer
   check. Do not click accept, reject, options, opt-out, or save controls.
3. Record the same A/R/O labels for the live visit, plus reviewer, region,
   viewport, and observed banner delay.
4. Reveal scanner diagnostics only after both label passes are complete.
5. Export the review JSON. Retained-evidence and live labels remain separate;
   live state must not overwrite the historical evidence label.

`delayed` means the control appeared after initial page render but within the
bounded human observation window. `absent` means the relevant first-layer
surface was visible and the specific control was not present. When the surface
cannot be established, use `unverifiable` rather than absence.

## Commands

Generate a production-backed packet:

```bash
pnpm v2:aro-likelihood-human-review -- --out-dir artifacts/aro-likelihood-human-review
```

Regenerate from the saved source snapshot:

```bash
pnpm v2:aro-likelihood-human-review -- \
  --source artifacts/aro-likelihood-human-review/source-snapshot.json \
  --out-dir artifacts/aro-likelihood-human-review
```

Validate an exported review:

```bash
pnpm v2:aro-likelihood-human-review -- --validate /path/to/aro-human-review.json
```

The packet is calibration input only. Any production likelihood projection,
finding, checklist, or score integration requires a separately reviewed and
approved versioned policy.
