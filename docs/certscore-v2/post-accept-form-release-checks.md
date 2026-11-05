# CertScore.ai post-Accept form release checks

The release fixture exercises deferred consent handlers, confirmed Accept, a retained form bootstrap arriving near the activity deadline, delayed forms, excess helper frames, masked fields, safe and withheld screenshots, canonical projection, and verified image bytes. It submits no forms and makes no public-site requests.

The owned slow-loader fixture also replays a roughly ten-second Accept dispatch and a 6.447-second form loader. Both structured forms must remain usable; each observed form has either a safe image or an explicit bounded-budget unavailability receipt. A loader that finishes outside the worker ceiling must not extend the three-second activity window or establish whole-site form absence.

Run `pnpm test:post-accept-forms`. Relevant fast/full preflight plans and the web/validation AWS workflows include this gate. The dedicated pull-request workflow runs it without deploying. Remote branch-protection settings are not changed by this source change.

## Capture invariants

Structured form follow-up and v8 image capture share the retained bootstrap request and the same original-window, capture, and worker deadlines. Form follow-up adds no requests/storage to the frozen activity window. Preserve the three-second activity window, existing worker ceiling, two-image cap, document binding, value masking and safety review. Historical image contracts remain readable. A screenshot is an earlier visual checkpoint; later field enrichment does not imply those fields were visible in that screenshot.

`formImageDiagnostics` distinguishes inventory wait, document binding, inventory, images and packet validation. Its outcome and image status counts preserve no-form, navigation, cancellation, deadline and withheld evidence. Missing images must not discard usable structured forms.

## Regional live verification

After scanner capture changes and before rollout, use an explicitly authorized local scan with the local code routed through the intended regional proxy. Verify HTTP and Chromium egress independently first. Finalize only that local scan using the normal local pipeline. Do not substitute a region label for IP evidence or invoke production scanning code to test local repairs.

For the currently reviewed SITS checkpoint, the observed expectation is two forms, nine fields and two independently safe images. This is a site-specific regression expectation, not a universal prevalence target or a guarantee that SITS never changes.

From the repository root, using the localhost database configuration:

```sh
TSX_TSCONFIG_PATH=tsconfig.base.json node --conditions=react-server \
  --env-file=apps/web/.env.local --import tsx scripts/verify-form-canary.ts \
  --scan-id SCAN_UUID --region Ireland --egress-sha256 sha256:VERIFIED_IP_HASH \
  --min-forms 2 --min-fields 9 --min-images 2 --output /tmp/form-canary.json
```

The verifier reads retained artifacts and the persisted report; it does not start a scan or schedule monitoring. It reports regional egress, acceptance, discovery, image capture, safety review and report delivery separately, and exits nonzero when the specified expectation is unmet. Open both form images in the localhost report to verify HTTP delivery and rendering as well.

Use owned fixtures as the stable release oracle. Live canaries reveal regional/site changes; a live failure requires evidence review, not automatically changing a target or relaxing safety. Extend regional coverage only using separately authorized scans and independently established egress; one Ireland result establishes no other region's behavior. Routine public calibration remains governed by the calibration program and central contact ledger; the owner's explicit SITS test authorization is scoped to this repair.

No new recurring scan schedule, infrastructure, worker budget, image-count ceiling or retention policy is introduced. Restoring previously missed image captures can use existing safety-review/storage allowances more often; production cost impact has not been measured. Deployment remains paused.
