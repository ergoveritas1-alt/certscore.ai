# Exact consent pixel sampling

Local implementation and verification, October 15, 2026. No deployment.

The canonical consent visual comparison keeps its single shared 80 ms allowance,
eligibility requirements, sampling positions, surrounding rings, colour bins,
tie rules, contrast calculations and review thresholds.

The implementation verifies the original full-image dimensions against the
retained viewport before decoding one exact analysis rectangle. That rectangle
contains both controls and every pixel used by the existing algorithm, including
the complete 12-pixel surrounding rings. It uses integer bounds derived directly
from the retained geometry. It performs no resize or new subsampling.

Raw pixel offsets are translated into that verified rectangle for computation.
The public measurement keeps original viewport dimensions, original control
coordinates and the SHA-256 of the original full image. The original screenshot
remains retained unchanged. No cropped screenshot or replacement image is saved.

Interior and background samples flow directly into the same four-bit histograms,
preserving sample order, sums, averages and first-seen ties. Outline emphasis
retains sample offsets instead of allocating RGB tuples for every sampled pixel.
Late, malformed, stale, occluded or mismatched evidence remains non-projectable.

Verification compares against full-frame sampling for horizontal and vertical
controls, fractional bounds, viewport edges, textured and nonuniform pixels,
larger controls with the existing stride, transparent PNG and JPEG inputs.
Read-only replay of three retained safe-image packets preserves exact metrics
and hashes. It does not repair or upgrade the stored historical reports.

The fresh Cookiebot Ireland scan retained pixel metrics in 44 ms and moved its
prominence check from Incomplete to Observed through the canonical assessment,
normalized concern, policy and CMP projection. This targeted verification is not
a rotating release-acceptance cohort or a guarantee against future contention.

No extra scan lane, decoder attempt, model call, retry, timeout, standing capacity
or deployment is introduced. Compute and temporary raw-buffer work decrease.
Normal newly retained comparison metadata is estimated below $0.01/month at
100,000 scans/month and 30-day retention. The targeted fresh verification is
estimated below $1 total using the existing Ireland proxy.
