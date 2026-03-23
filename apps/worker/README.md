# Worker App

`apps/worker` is legacy compatibility infrastructure in `WC01`.

It still contains:

- validation worker runtime paths that remain owned by `WC01`
- queue and scheduler code kept for migration carryover
- scanner-adjacent debugging and inspection scripts that have not been retired yet

It should not be treated as the primary scanner runtime home.

The standalone scanner service now lives in `WS01`. In `WC01`, prefer:

- `apps/web` for product control-plane behavior
- `apps/validation-worker` and validation docs for active validation runtime ownership
- scanner-health compatibility shims only where `WC01` still needs to observe scanner state through the shared database contract
