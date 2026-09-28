# DNS detection benchmark fixtures

These packets are deterministic, fictional fixture evidence for exercising the benchmark input format. They are not observations of real sites, are not human-adjudicated labels, and must not be used to claim detector precision or recall. Packets contain no detector output so they can be presented as evidence-only reviewer packets.

Prepare two private sidecars after a named reviewer labels each unique site from the packet evidence:

- `predictions.jsonl`: `{"packetId":"fixture-s01-visit-a","prediction":"positive"}` where prediction is `positive`, `negative`, `unknown`, or `limited`.
- `human-labels.jsonl`: `{"siteKey":"synthetic-site-01","truth":"present","reviewer":"reviewer name","evidenceOnlyAttested":true,"evidencePacketSetSha256":"<hash>","evidenceRefs":["s01-a1"],"rationale":"..."}` where truth is `present`, `absent`, or `unknown`. Obtain site hashes before review with `node --import tsx scripts/dns-detection-benchmark.ts --hashes <evidence-only-packets.jsonl>`; the hash binds the label to the exact packet set reviewed.

Do not infer labels from these example excerpts. A reviewer must inspect retained evidence independently; label files belong outside this checked-in fixture directory. Production audit rows or identifiers must never be copied into this corpus.

Run with:

```sh
node --import tsx scripts/dns-detection-benchmark.ts \
  scripts/dns-detection-benchmark-fixtures/evidence-only-packets.jsonl \
  /path/to/predictions.jsonl /path/to/human-labels.jsonl
```

The unit of analysis is a unique site. Multiple visits are grouped before scoring. Unknown/limited/failed detector outcomes count as misses for human-labeled present sites and as abstentions, not true negatives, for human-labeled absent sites. The provisional release gate requires at least 95% precision, 90% recall, and 95% complete-capture coverage, with no unlabeled or unresolved sites and nonempty denominators. These thresholds are internal readiness criteria, not measured production performance. Incomplete captures never establish absence.
