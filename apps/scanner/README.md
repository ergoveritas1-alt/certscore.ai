# Scanner App

`apps/scanner` is the phase-1 home for the scanner runtime. It owns:

- scan claiming and execution
- scanner heartbeat and runtime health
- scanner crawler identity configuration
- scheduled scan creation
- future extraction to a standalone scanner repo and AWS runtime

In phase 1 this app still runs in the monorepo and can use the shared `@website-signal-risk-scanner/scan-core` package, but it should be treated as a separate service boundary from the product web apps.
