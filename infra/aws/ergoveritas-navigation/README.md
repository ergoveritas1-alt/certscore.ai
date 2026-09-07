# ErgoVeritas crawl navigation

Owner-approved September 6, 2026: make all published content pages reachable
through HTML anchors starting at the homepage, and permit only the canonical
`ConsentCheckBot` crawler product token in robots.txt.

The homepage links to `/.well-known/certscore-canary/index.html`. That directory
links to all 176 manifest fixtures, 11 additional fixtures/embedded examples,
and the contact page. Other public pages remain linked from the homepage.
The directory retains `noindex, noarchive`, while allowing link following.
Fixture runtime behavior remains unchanged. One legacy sample's broken policy
link now targets the existing `policy/broad-baseline.html`.

Deploy through the existing AWS S3/CloudFront topology:

```sh
python3 scripts/deploy-ergoveritas-navigation.py          # prepare and inspect
python3 scripts/deploy-ergoveritas-navigation.py --apply  # publish
python3 scripts/verify-ergoveritas-navigation.py          # live verification
```

Deployment checks the AWS account/origin, saves original objects under `tmp/`,
uses conditional ETag writes, and invalidates the changed CloudFront paths.
The homepage snippet must be preserved by future homepage rebuilds; rerun this
idempotent deploy step after such a rebuild. The canary index source is shared
with the existing canary bundle deploy script.

Verification starts from `/` only. The S3 inventory is consulted after crawling
solely to assess completeness, never to seed discovery. Error documents and
Google's verification file are excluded from content-page counts. Results are
written to `tmp/qa/ergoveritas-homepage-crawl.{json,csv}`.

Verified live September 6, 2026: 193 of 193 content pages reachable within two
link hops; zero request errors; all locally maintained canary HTML hashes match.
Both apex and www robots policies allow ConsentCheckBot and disallow other
crawler product tokens. Robots policy is voluntary crawler guidance, not HTTP
authentication or access control.

Estimated incremental recurring static storage/bandwidth cost: below $1/month;
no added compute services, model calls, or scan invocations.
