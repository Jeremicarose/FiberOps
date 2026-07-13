# Failure modes

## Related docs

- [Developer guide](./developer-guide.md)
- [Runtime model](./runtime-model.md)
- [Contracts](./contracts.md)
- [Local lab runbook](./local-lab-runbook.md)
- [End-to-end validation](./e2e-validation.md)

| Category                 | Typical evidence                                                         | Meaning                                                  | Operator action                                                |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| `rpc_unavailable`        | transport error, endpoint unreachable                                    | Fiber RPC could not be contacted                         | Verify node process, endpoint, and network reachability        |
| `rpc_unauthorized`       | unauthorized response, bearer token failure                              | RPC is reachable but auth blocks reads                   | Provide a valid read-scoped Biscuit token                      |
| `rpc_invalid_response`   | non-JSON or malformed JSON-RPC payload                                   | Upstream service is not returning trusted Fiber RPC data | Inspect proxy/service response and fix upstream payload shape  |
| `invalid_invoice`        | parse failure from `parse_invoice`                                       | Input invoice is malformed or unsupported                | Re-copy or regenerate the invoice                              |
| `invoice_expired`        | invoice timestamp + expiry in the past                                   | Recipient should reject payment even if a route exists   | Request a fresh invoice                                        |
| `no_open_channels`       | zero channels returned                                                   | Node is online but not payment-ready                     | Fund node and open channels                                    |
| `channel_not_ready`      | channels exist but none look ready                                       | Channel state has not reached an active sendable state   | Wait for state transition or inspect pending/shutdown channels |
| `target_not_in_graph`    | target pubkey absent from graph snapshot                                 | Public routing evidence is missing for the target        | Confirm pubkey, node availability, and graph advertisement     |
| `insufficient_liquidity` | requested amount exceeds outbound estimate or route probe blocking error | Sender liquidity is too low for the payment              | Retry smaller amount, rebalance, or refill/open channels       |
| `route_unavailable`      | failed route construction without stronger evidence                      | Graph/routing constraints prevented a usable path        | Inspect topology, target visibility, and fee/path constraints  |
| `payment_inflight`       | status `Created` or `Inflight`                                           | Payment has not settled yet                              | Poll `get_payment` until terminal state                        |
| `success`                | payment status `Success` or decisive dry-run-ready path                  | Known-good baseline                                      | Record baseline and compare future failures against it         |

## Evidence tiers

- **Real**: live RPC payment status, live channel state, successful or blocked `send_payment(dry_run)`
- **Heuristic**: readiness inferred from channel balances, graph visibility, or invoice metadata
- **Fixture**: demo scenarios in `src/lib/demo-scenarios.js`

## Alerting behavior

FiberOps emits operator-facing alerts when:

- the top-level diagnosis is operationally actionable
- partial RPC reads degrade the snapshot
- route preview is explicitly blocked
- the snapshot is degraded without a stronger alert already explaining why
