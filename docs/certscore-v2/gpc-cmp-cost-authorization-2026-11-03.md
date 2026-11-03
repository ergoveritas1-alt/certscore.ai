# CertScore.ai combined CMP/GPC cost authorization — November 3, 2026

The owner approved replacing the combined $8/month CMP/GPC allowance with **up to $10/month at 100,000 scans per month and 30-day retention**. The approval was the owner's “Approved” response to the explicit $10 combined-allowance question. This replaces the previous allowance; it is not an additional $10 envelope.

The pending capture and lossless-retention candidate has a conservative combined recurring estimate of **$9.74/month** under the assumptions documented in [the lossless-artifact review](gpc-wide-artifact-fallback-2026-11-02.md). The estimate is not a configured billing cap or a claim of measured production cost, Lambda savings or production population coverage. Local release hardening adds no recurring AWS spend or paid-service use.

The cost hold described in [the local release-hardening note](gpc-release-hardening-2026-11-02.md) is cleared. The verified code candidate remains `fce8b51af0ccb56d97813a0882576dee9fe5b6f8`; its test results and source bytes are unchanged. This authorization is a subsequent documentation addendum, not a new implementation or test run.

The approval authorizes **no push, merge, package publication, deployment, infrastructure/configuration or flag change, public scan, production access, or additional model call**. Existing proof gates, capture/action budgets, worker sizes, lane topology and authorized retention assumptions remain intact. Future release order remains compatible consumers before producer images through the checked-in publication and AWS workflows, subject to separate release authorization.
