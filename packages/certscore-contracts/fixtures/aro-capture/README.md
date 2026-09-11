# A/R/O capture regression fixtures

`reviewed-corpus.json` is a bounded, synthetic replay corpus derived from the
662 non-Ergo retained records. Its `assessmentInput` contains typed retained
facts only; replay never turns a raw label into an A/R/O control. The stored
assessment is the comparison baseline, and each changed conclusion is emitted
by `scripts/aro-capture-regression.ts` with `model_assisted` attribution.

`classifier-labels.json` is a separate upstream inventory corpus for fresh
classifier tests. It includes the reviewed short-label candidates and paired
navigation negatives. It must not be used to rewrite stored WC01 assessments.

Run the bounded replay locally:

```sh
node --import tsx scripts/aro-capture-regression.ts \
  packages/certscore-contracts/fixtures/aro-capture/reviewed-corpus.json
```

An optional report path must be under `artifacts/`.

The cohort report is a retrospective canonical recomputation against stored
assessments. A changed state is not evidence of a production code regression;
changes without an explicit projector guard reason remain in the review queue.
