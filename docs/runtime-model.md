# Runtime model

## Related docs

- [Developer guide](./developer-guide.md)
- [Architecture](./architecture.md)
- [Failure modes](./failure-modes.md)
- [Local lab runbook](./local-lab-runbook.md)

## Evidence model

| Surface          | Source type                 | Examples                                                                   | Notes                                                                                        |
| ---------------- | --------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Demo scenarios   | Fixture                     | `route-build-failure`, `preflight-liquidity-block`                         | Deterministic local fixtures for demos and tests                                             |
| Invoice parse    | Real or fixture             | `parse_invoice` result or demo invoice payload                             | Can be live or fixture-backed depending on mode                                              |
| Payment status   | Real or fixture             | `get_payment` / demo `payment` object                                      | Terminal failure evidence is stronger than heuristics                                        |
| Channel state    | Real or fixture             | `list_channels` / demo `channels`                                          | Used for readiness and outbound estimation                                                   |
| Graph visibility | Real or fixture             | `graph_nodes` / demo graph snapshot                                        | Used to classify missing targets                                                             |
| Route preview    | Real, heuristic, or fixture | invoice dry run, keysend dry run, deep route build, or heuristic inference | `routePreview.mode` and `routePreview.evidenceMode` declare which kind of evidence is in use |
| History          | Real local persistence      | `diagnostic-history.json`                                                  | Only present when history persistence is enabled                                             |

## Real vs heuristic vs fixture

- **Real** means FiberOps observed current data from a live node or a live dry-run route probe.
- **Heuristic** means FiberOps inferred readiness from channel, graph, invoice, or payment context without a decisive dry-run proof.
- **Fixture** means the result came from demo data embedded in the repository.

`analysisDepth=deep` is a live-analysis option, not a separate evidence tier. It opts into heavier route analysis such as `graph_channels` and `build_router`.

## Live execution model

- A live request first resolves an execution plan.
- Policy validation runs against every resolved node that will be contacted.
- Per-node diagnosis is computed before aggregate selection.
- The top-level result is anchored to a selected node and adds multi-node metadata rather than mixing sender state and route evidence across nodes.

## Regenerating runtime artifacts

Generated local-lab state lives under:

- `runtime/`
- `vendor/`

Regenerate it with:

```bash
npm run lab:reset
npm run lab:prepare
npm run lab:check
```

`lab:prepare` remains the source of truth for generation.
