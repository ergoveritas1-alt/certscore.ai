# Static Insights publishing on AWS

Static articles and images are source-controlled under `content/insights/`.
The existing ECS web app reads a release manifest from the existing private S3
bucket. Article HTML, metadata, JSON-LD and images publish independently of the
application image. The original leaderboard and image URLs are preserved.
Existing React Insights pages, including interactive scan forms, remain intact;
their routes are reserved so a static publication cannot shadow them.

## Edit and publish

1. Edit the article HTML or image under `content/insights/`.
2. For a new article, add its path, title, description, dates and HTML filename to
   `content/insights/catalog.json`. Add images there too. New image URLs use
   `/insights/assets/<filename>.png` (JPEG, WebP and GIF are also supported).
   The original leaderboard image retains `/images/ai-leaderboard-social-card.png`.
3. Validate: `pnpm exec tsx apps/web/scripts/publish-insights.ts`.
4. Commit and push. Changes to this content directory on `main` run
   `.github/workflows/insights-publish.yml`; they do not trigger the web image
   workflow. On a release branch, manually dispatch that workflow with its ref.
   A commit that also changes application files skips automatic publication;
   finish its app release first, then dispatch content publication explicitly.

The workflow validates static HTML, canonical and sharing metadata, JSON-LD,
image types and path boundaries. Executable scripts, embeds and em dashes are
rejected. It uploads and reads back content-addressed objects, retains the
release manifest, then conditionally replaces `public-insights/live.json`.
A conflicting publisher fails rather than overwriting another activation.
The Insights index and sitemap read the same manifest, so a new static article
does not need an application deployment to become discoverable.

Responses currently use `Cache-Control: no-store`, including errors, so an
update needs no cache purge or app restart. The publisher verifies public HTML,
image hashes, index and sitemap links, and records `/api/version` before and
after. The application SHA must remain unchanged. Known Cloudflare email
obfuscation is decoded solely for the byte comparison; protection is unchanged.

## Rollback

Dispatch the same workflow with `rollback_release` set to a retained 40-character
content commit SHA. It verifies the retained manifest and every referenced object,
then conditionally restores that manifest. No application deployment is involved.
Release manifests and immutable objects are retained under `public-insights/`;
there is no bucket-wide lifecycle or retention change. Do not delete objects
referenced by an active or retained release. Review prefix storage growth during
normal operations rather than applying a lifecycle rule that could expire a
still-active article. Git remains the editorial source of truth.

## One-time setup

The application migration needs one normal public-web AWS release. Before that
release, seed the manifest from a clean committed source:

```sh
AWS_REGION=us-west-1 INSIGHTS_S3_BUCKET=ws01-scan-artifacts-199536052647-us-west-1 \
  pnpm exec tsx apps/web/scripts/publish-insights.ts --apply --seed-before-app-deploy
```

The seed flag works only before the first activation. After deploying the app,
run the publisher with `--verify-only` before claiming the migration works.
Then demonstrate a content-only commit through the publishing workflow and
retain its receipt plus the unchanged ECS task definition and app SHA.

`scripts/configure-insights-publisher.ts --apply` bootstraps only the dedicated
IAM role and policy declared in `infra/aws/web-ecs/insights-publishing.tf`.
The checked-in import blocks let the normal infrastructure stack adopt those
resources without a broad Terraform apply during this release. The GitHub
environment is `insights-production`; the OIDC role can Get/Put only the
`public-insights/` prefix and list only keys in that prefix. It has no ECS, ECR,
secret, scanner or private-evidence permission. Existing app storage access is
reused. No bucket is made public and no new compute service is added.

## Cost and scope

Estimated incremental S3 requests and small retained objects are below
$0.10/month at 10,000 article views and ordinary editorial volume, using the
existing same-region S3/ECS capacity and SSE-S3 encryption. This estimate was
disclosed before implementation. Storage grows with retained unique versions;
the estimate is not a fixed spending cap. Existing public transfer and CI usage
continue. No scan, model call, provisioned capacity or bucket retention setting
changes. Runtime code and interactive React-page changes still use the normal
application release process.
