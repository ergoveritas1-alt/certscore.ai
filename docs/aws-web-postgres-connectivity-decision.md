# AWS Web PostgreSQL Connectivity Decision

This document records the current decision for moving the public web tier off the fixed-egress GCP VM lane.

## Decision

Do not cut `certscore.ai` or `consentcheck.site` from the current GCP VM lane to AWS Amplify Hosting while the web SSR runtime still requires direct PostgreSQL access.

If the steady-state AWS target must preserve direct server-side PostgreSQL access for auth, dashboard reads, scan enqueue, and report rendering, the recommended AWS target is:

1. private PostgreSQL access inside AWS
2. a web-serving runtime with explicit VPC egress controls
3. secret injection that does not depend on build artifacts

The preferred AWS runtime for that shape is an application service that supports VPC egress, such as AWS App Runner with a VPC connector, or ECS/Fargate behind the appropriate edge layer.

Until that exists, keep the public web lane on the hardened GCP VM path.

## Why this decision exists

The current `apps/web` runtime still depends on direct PostgreSQL connectivity for:

- Better Auth sessions and login flows
- authenticated dashboard reads and writes
- domain and scan management
- report rendering paths

That dependency is already documented in [docs/aws-web-dependency-matrix.md](/Users/benmasek/WC01/docs/aws-web-dependency-matrix.md).

## Platform facts behind the decision

### 1. Amplify Hosting handles SSR secrets cautiously, but not as a runtime networking solution

AWS Amplify Hosting documents that server-side code does not automatically receive build environment variables, and it recommends selectively writing values into `.env.production` if you need them available to Next.js at build/runtime.

It also explicitly warns against storing credentials or secrets in environment variables that become readable from deployment artifacts.

Repo implication:

- Amplify secret wiring is already a special concern in this repo.
- We added [docs/amplify-web-runtime-validation.md](/Users/benmasek/WC01/docs/amplify-web-runtime-validation.md) and [apps/web/scripts/check-amplify-runtime-env.ts](/Users/benmasek/WC01/apps/web/scripts/check-amplify-runtime-env.ts) to catch configuration failures early.
- That solves validation, not network reachability.

Source:

- AWS Amplify SSR environment variables:
  [https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html)
- AWS Amplify environment variables and secret guidance:
  [https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)

### 2. Production PostgreSQL is best treated as private infrastructure

AWS RDS guidance is clear that private access is the better production default for sensitive workloads.

Source:

- AWS RDS public vs private access:
  [https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-public-private.html](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-public-private.html)

Repo implication:

- a production cutover that depends on broad public ingress to PostgreSQL is the wrong target shape
- a migration should move toward private database connectivity, not away from it

### 3. AWS App Runner explicitly supports VPC egress for private resources

AWS App Runner documents outbound VPC access through a VPC connector.

Source:

- AWS App Runner VPC egress:
  [https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html](https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html)

Repo implication:

- if direct PostgreSQL access remains part of the SSR contract, a runtime with explicit VPC egress support is the cleaner fit than Amplify Hosting for the web-serving layer

## Options considered

### Option A: keep Amplify Hosting and expose PostgreSQL publicly to whatever egress Amplify uses

Decision: rejected

Why:

- it weakens the database posture
- it depends on a hosting layer whose documented materials here solve env handling, not private database connectivity
- it does not meet the repo's current production-hardening bar

This is an inference from the official docs above and the repo's current dependency shape.

### Option B: keep Amplify Hosting only after the critical SSR routes no longer need direct PostgreSQL access

Decision: conditionally acceptable, but not current-state ready

Why:

- if auth, dashboard, and report-critical paths moved behind API surfaces that do not require direct DB access from the SSR host, Amplify becomes more plausible again
- that is a product and architecture change, not a deployment-only change

### Option C: move the web SSR runtime to an AWS service with VPC egress and keep PostgreSQL private

Decision: recommended if AWS cutover must happen before a deeper app redesign

Why:

- it matches the current server-side dependency shape
- it preserves a stronger DB security model
- it is operationally more defensible than public database ingress for an SSR app

## Accepted path

The accepted migration sequence is:

1. keep public web production on the GCP VM lane
2. define the AWS private connectivity model for PostgreSQL
3. choose an AWS web-serving runtime with explicit VPC egress if direct PostgreSQL access remains required
4. wire secrets using the runtime's proper secret mechanism
5. run the Amplify or runtime validation gates on the target host
6. cut DNS only after the target host proves:
   - auth works
   - `/api/full-scan` returns `202`
   - dashboard pages load
   - report pages load
   - artifact-backed operations work

## What this means right now

Right now, the repo should treat these statements as true:

- AWS Amplify Hosting is still the preferred aspirational topology for simple web hosting in this repo
- it is not yet the accepted production target for the current SSR-plus-PostgreSQL dependency shape
- the current production-safe lane remains the fixed-egress GCP VM

## Trigger to revisit this decision

Revisit this document only if one of these becomes true:

1. the public web app no longer needs direct PostgreSQL access for critical SSR flows
2. AWS Amplify Hosting gains a documented, production-acceptable private connectivity model for this workload
3. the team chooses App Runner or ECS/Fargate as the actual AWS web-serving target
