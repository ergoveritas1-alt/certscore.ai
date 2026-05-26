# AWS Amplify Deployment Reference

This document is historical reference material only. It is not the active WC01 production deployment path, and the CertScore Amplify app has been deleted from AWS.

Current production truth:

- `certscore.ai` runs on the AWS ECS/Fargate public web path.
- `main` deploys through [/.github/workflows/web-aws-ecs-deploy.yml](/Users/benmasek/WC01/.github/workflows/web-aws-ecs-deploy.yml).
- `consentcheck.site` is not a WC01 web host and must not be claimed or deployed from this repo.

If an Amplify rehearsal is ever revisited, keep it limited to CertScore unless ownership changes explicitly. The checked-in deployment topology in [config/deployment-topology.json](/Users/benmasek/WC01/config/deployment-topology.json) remains the source of truth for deployment audits.
