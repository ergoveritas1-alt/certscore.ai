# CertScore Launch Checklist

## Technical Launch
- Deploy the web app
- Deploy the worker
- Configure Upstash Redis
- Configure PostgreSQL, Better Auth providers, and S3-compatible storage
- Apply database migrations
- Install Playwright Chromium in the worker environment
- Confirm environment variables are set in every deployed service

## Validation
- Run the environment readiness checks
- Validate preview scan creation from the homepage
- Validate a full scan from the authenticated app
- Confirm findings persist for accessibility, privacy, and legal categories
- Confirm `risk_scores` and `score_breakdowns` rows are created
- Confirm report generation succeeds
- Confirm PDF generation and download succeed
- Run a second scan on the same domain and verify regression output
- Run the scheduler sweep and verify due scans enqueue correctly

## Demo Readiness
- Prepare one live demo domain and one backup domain
- Open the sample report in a separate tab
- Have a completed scan ready in the dashboard
- Confirm PDF export is already generated for the demo account
- Keep the FAQ and pricing pages ready for objections

## Distribution
- Share the sample report in outreach
- Contact agencies that already do website reviews
- Contact developers working with WordPress and Shopify sites
- Reach out to SMB owners with a simple risk-review offer
- Post in relevant developer and agency communities

## Feedback Loop
- Ask every early user what they expected before running a scan
- Record what confused them in the preview-to-signup flow
- Ask which findings felt most valuable
- Ask what would make CertScore worth paying for
- Update messaging based on repeated objections or confusion
