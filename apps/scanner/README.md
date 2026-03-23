# Scanner App

`apps/scanner` is legacy phase-1 carryover from when scanner runtime work still lived in this monorepo.

The standalone scanner runtime now lives in `WS01`. In `WC01`, this app should be treated as compatibility scaffolding only.

`WC01` remains responsible for:

- scan creation from product flows
- reading scan status and results
- product-facing dashboards and workflows
- compatibility updates needed while the shared database contract is still in transition
