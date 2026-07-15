# FiberOps | Fiber on CKB Operator Console

FiberOps is a read-only operator console for Fiber on CKB. It turns raw node state into an operator-friendly explanation of what failed, what evidence is real, and what to do next.

## Problem

Fiber payments do not fail in a way that is easy for operators, hackathon judges, or backend developers to understand.

When a payment breaks, the root cause is usually scattered across low-level RPC reads such as channel state, outbound liquidity, graph visibility, invoice validity, payment lifecycle state, and route-readiness evidence. That creates a practical gap:

**Fiber has the raw signals, but not an operator-first diagnostic surface that turns those signals into an actionable explanation.**

FiberOps exists to close that gap.

## Solution

FiberOps provides a single diagnostics engine through four surfaces:

- **Browser UI** for demos and operator workflows
- **HTTP API** for backend integration
- **CLI** for scripted diagnostics
- **Library exports** for embedding in other tools

It is designed to answer a small set of operational questions clearly:

- What failed?
- Why did it fail?
- Is the route currently ready?
- Is that conclusion based on real, heuristic, or fixture evidence?
- Do multiple live nodes agree on the result?
- What should the operator do next?

FiberOps is not a wallet and not a payment sender UI. It is operator software for understanding Fiber routing behavior safely.

The current FiberOps shell is organized around a compact core navigation set:

- **Overview** for health, changes, and next actions
- **Nodes** for sender posture and live node comparison
- **Payments** for history, retries, and failure clusters
- **Routes** for candidate path analysis
- **Diagnostics** for deep failure explanation
- **Logs** for recent events and trace
- **Reports** for exportable summaries
- **Settings** for observation defaults and runtime safety

The interface is workflow-oriented rather than tab-heavy. Supporting investigation tools such as **Simulations**, replay history, and lab validation are launched from quick actions, command palette entries, or guided demo flows instead of competing with the primary navigation all the time.

Key architectural properties:

- live execution resolves the actual node set first, validates every resolved node against policy, then runs diagnosis
- per-node diagnosis is computed before aggregate selection, so the top-level result stays anchored to a selected node instead of mixing evidence from different senders
- route evidence is explicit: heuristic, invoice dry run, keysend-style dry run, or opt-in deep route-build analysis
- history persistence is behind a backend seam with a compatible JSON backend and an append-safe NDJSON backend

## Architecture at a glance

```mermaid
flowchart LR
    UI[FiberOps Browser UI] --> API[HTTP API / server-app]
    CLI[CLI] --> DIAG[Diagnostics Engine]
    LIB[Library Consumers] --> DIAG
    API --> DIAG
    DIAG --> PLAN[Execution Plan + Request Policy]
    DIAG --> RPC[Fiber JSON-RPC Nodes]
    DIAG --> HIST[History Backend]
    API --> OBS[Observability + Metrics]
```

Operationally, FiberOps validates a request, resolves the exact node set that will be contacted, gathers Fiber evidence, computes per-node diagnosis first, then assembles a selected-node-anchored result with summaries, route previews, alerts, and optional history comparison.

## Screenshots

The screenshots below reflect the current FiberOps shell and show the main operator workflows as they exist in the app today.

### Diagnostics workspace: healthy baseline

A successful payment becomes a known-good baseline that operators can compare against later failures.

![FiberOps diagnostics success baseline](docs/screenshots/current-diagnostics-success-baseline.png)

### Diagnostics workspace: replayed investigation

Replay mode preserves prior failure context so a judge or operator can explain what happened without recreating the incident live.

![FiberOps diagnostics replay investigation](docs/screenshots/current-diagnostics-replay-investigation.png)

### Logs workspace

FiberOps surfaces recent runtime issues, notifications, and partial RPC failures in a dedicated operator view.

![FiberOps logs workspace](docs/screenshots/current-logs-workspace.png)

### Routes workspace

Route analysis keeps inputs, candidate posture, confidence, and blockers together in one flow.

![FiberOps routes workspace](docs/screenshots/current-routes-workspace.png)

## Quick start

### Prerequisites

- Node.js 20+
- npm
- Playwright Chromium for browser smoke coverage

### Local lab flow

```bash
npm ci
npm run lab:reset
npm run lab:prepare
npm run lab:check
npm run dev
```

Open `http://localhost:3000`.

For local configuration templates, see `.env.example` and `examples/live-node-set.json`.

For a judge-facing hosted deployment with a real Fiber backend, see [VPS judging deployment](docs/vps-judging-deploy.md).

## Usage overview

### Browser UI

Use the FiberOps app to:

- open the current network overview first
- compare configured senders and peers in **Nodes**
- search failure history and healthy baselines in **Payments**
- review path and proof posture in **Routes**
- run deep investigation flows in **Diagnostics**
- inspect recent runtime issues in **Logs**
- export reusable summaries from **Reports**
- manage connection and policy defaults in **Settings**
- switch into **Demo** or **Live** mode depending on whether the workflow should be deterministic or backed by real nodes
- switch between auto, light, and dark themes during review
- launch **Simulations** from guided demo buttons and quick actions when you want deterministic replay scenarios

### Guided proof and demo presets

The `Simulations` workspace includes guided proof cards and one-click presets for reliable demos and validation:

- `Healthy Payment`
- `Low Liquidity`
- `Offline Node`
- `Fee Budget Too Low`
- `Route Not Found`

This flow is designed for presentations and judging. It avoids the need to recreate failures live while an audience is watching and provides a clean bridge from deterministic replay to live-node proof.

### HTTP API

Main endpoints:

- `GET /api/bootstrap`
- `POST /api/diagnose`
- `GET /api/health`
- `GET /api/metrics`
- `GET /api/contracts/diagnose`
- `GET /api/contracts/diagnose/request`
- `GET /api/contracts/diagnose/result`
- `GET /api/contracts/diagnose/rules`

All routes return explicit envelopes:

- success: `{ ok, data, meta }`
- failure: `{ ok, error, meta }`

Example request:

```bash
curl -X POST http://127.0.0.1:3000/api/diagnose \
  -H 'content-type: application/json' \
  -d '{
    "mode": "demo",
    "scenarioId": "preflight-liquidity-block"
  }'
```

Optional live-analysis fields:

- `analysisDepth`: `standard` or `deep`
- `outputMode`: `full`, `machine`, `operator`, `backend`, or `wallet`

`standard` keeps live diagnosis fast and compatible. `deep` opt-ins to `graph_channels` and `build_router` analysis.

### CLI

```bash
npm run diagnose -- --mode demo --scenario-id route-build-failure
npm run diagnose -- --mode demo --scenario-id preflight-liquidity-block --output-mode operator
npm run diagnose -- --mode live --endpoint http://127.0.0.1:8227 --amount 10000000000 --target-pubkey <pubkey> --analysis-depth deep
cat payload.json | npm run diagnose -- --output-mode backend
```

### Library

```js
import {
  runDiagnosis,
  formatDiagnosisOutput,
  validateDiagnosisRequest
} from "fiberops/diagnostics";
```

## Documentation index

Start here:

- [Developer guide](docs/developer-guide.md) — contributor and integrator overview
- [Architecture](docs/architecture.md) — system structure and request flow
- [Contracts](docs/contracts.md) — request, result, and compatibility model
- [Runtime model](docs/runtime-model.md) — evidence tiers and runtime semantics
- [Failure modes](docs/failure-modes.md) — diagnosis taxonomy and operator actions
- [Local lab runbook](docs/local-lab-runbook.md) — prepare and operate the bundled lab
- [VPS judging deployment](docs/vps-judging-deploy.md) — host FiberOps plus a private Fiber node on a VPS
- [End-to-end validation](docs/e2e-validation.md) — validation paths for UI, API, and live lab workflows
- [Judge demo narrative](docs/judge-demo.md) — story-first presentation flow for demos and judging
- [Release process](docs/release-process.md) — release checklist and tagging flow

Suggested reading paths:

- **New to FiberOps:** README -> Developer guide -> Architecture
- **Integrating the API:** README -> Developer guide -> Contracts -> Runtime model
- **Running the local lab:** README -> Local lab runbook -> End-to-end validation
- **Hosting for judges:** README -> VPS judging deployment -> Judge demo narrative
- **Debugging a failure:** README -> Failure modes -> Runtime model -> Contracts
- **Presenting to judges:** README -> Judge demo narrative -> End-to-end validation

## Contributing

Contribution workflow and repository policy live in [CONTRIBUTING.md](CONTRIBUTING.md).

Before opening a pull request:

1. describe the operator problem being solved
2. keep the change focused and evidence-driven
3. run `npm run test:all`
4. run `npm run check`
5. update docs, examples, and screenshots when user-facing behavior changes

## Release

Release guidance lives in [docs/release-process.md](docs/release-process.md).

## License

FiberOps is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
