# Isolated GPC controlled study

Authoritative research files: `artifacts/research/gpc-controlled-study-2026/`.
Source files here never replace production runtime modules. The runner imports canonical GPC injection/semantic parsing, access classification, network guards and vendor attribution.

Preparation (offline except public frame download):

```sh
node --import tsx scripts/research/gpc-study/calibrate.ts
python3 scripts/research/gpc-study/summarize_calibration.py
node --import tsx scripts/research/gpc-study/freeze-sample.ts
python3 scripts/research/gpc-study/audit-plan.py
node --import tsx --test scripts/research/gpc-study/*.test.ts
pnpm exec tsc -p scripts/research/gpc-study/tsconfig.json
node scripts/research/gpc-study/build.mjs
```

`freeze-sample.ts` requires the retained, complete, rank-verified Tranco V349N top-million CSV. It is deterministic and never consults production outcomes. Do not regenerate a different seed/list after looking at results.

The research image is built from the study_runner Dockerfile and pinned by immutable digest before pilot. Probe and fixture results must match the actual Linux executable. `deploy-pilot.mjs` creates a separate AWS research function/repository and refuses to overwrite an existing function; it never updates production. Read cost_estimate.md and the repository cost rule before running it. No deployment command is part of the ordinary analysis scripts.

Execution:

```sh
node artifacts/research/gpc-controlled-study-2026/study_runner/run.cjs artifacts/research/gpc-controlled-study-2026 plan
node artifacts/research/gpc-controlled-study-2026/study_runner/run.cjs artifacts/research/gpc-controlled-study-2026 pilot
```

A separate explicit owner instruction, budget approval, current contact export for all 1,000 sites and completed validation are required before the `full` mode. No authorization file is supplied in this change. Full launch command after those gates:

```sh
node artifacts/research/gpc-controlled-study-2026/study_runner/run.cjs artifacts/research/gpc-controlled-study-2026 full
```

Do not use `full` to rerun pilot results. Run namespaces are distinct. Every `*.started` marker is created with exclusive creation; every terminal JSON is written via temporary-file rename. Interrupted started visits become explicit uncertain terminal attempts on resume, never automatic repeat browsing. For a crashed scheduler, first verify no local scheduler or remote invocation is active, preserve checkpoint/lock as audit evidence, then remove only that run's `.scheduler.lock` directory and rerun the same mode. Never remove started/terminal markers to rescue outcomes. ECR/function reuse requires exact digest parity, not a mutable tag.

Offline analysis:

```sh
python3 scripts/research/gpc-study/analyze_study.py artifacts/research/gpc-controlled-study-2026 pilot-v3
```

Shareable aggregate files go to exports/. Internal evidence/URL mappings/contact history stay under private/. Blinded human validation is not replaced by automated fixture success.
