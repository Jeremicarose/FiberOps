# FiberOps | Fiber on CKB Operator Console

FiberOps is a read-only Fiber diagnostics console for operator debugging, backend preflight checks, and judge-friendly demos. It exposes the same diagnostics surface through a browser UI, HTTP API, CLI, and reusable library exports.

## Quick start

```bash
npm install
npm run lab:reset
npm run lab:prepare
npm run lab:check
npm run dev
```

Then open `http://localhost:3000`.

If you need to start the bundled lab nodes directly, use:

```bash
FIBER_SECRET_KEY_PASSWORD=... ./scripts/start-node1.sh
FIBER_SECRET_KEY_PASSWORD=... ./scripts/start-node2.sh
```

Both wrappers now delegate to `scripts/start-node.sh` so the node-start workflow stays consistent.

## Quality gates

```bash
npm run test:diagnostics
npm run test:contracts
npx playwright install chromium
npm run test:browser
npm run test:all
npm run check
```

`npm run check` is the full reviewer path: formatting, typecheck, diagnostics/API integration coverage, and browser smoke coverage.

`build` is a validation build for this plain-ESM package and currently uses `npm pack --dry-run` rather than introducing a bundling step.

## Main surfaces

- UI: `public/index.html`, `public/app.js`, `public/styles.css`
- HTTP app: `src/lib/server-app.js`
- Runtime launcher: `src/server.js`
- CLI: `src/cli.js`
- Diagnostics package: `src/lib/diagnostics/`

## API summary

Main endpoints:

- `GET /api/bootstrap`
- `POST /api/diagnose`
- `GET /api/contracts/diagnose`
- `GET /api/contracts/diagnose/request`
- `GET /api/contracts/diagnose/result`
- `GET /api/contracts/diagnose/rules`

All API routes return explicit success/error envelopes. The browser client now handles non-2xx bootstrap and diagnose responses explicitly and renders degraded state instead of silently breaking.

`POST /api/diagnose` now also enforces a request policy layer while keeping the published envelopes stable:

- `content-type: application/json` is required
- oversized JSON bodies are rejected with structured errors
- malformed JSON returns an explicit invalid-request envelope
- live mode allows loopback/local lab endpoints by default
- arbitrary external live endpoints require explicit server policy opt-in
- bearer tokens are blocked on obviously unsafe transports unless explicitly allowed

## Reusable interfaces

### Library

```js
import {
  runDiagnosis,
  formatDiagnosisOutput,
  validateDiagnosisRequest
} from "fiberops/diagnostics";
```

### CLI

```bash
npm run diagnose -- --mode demo --scenario-id route-build-failure
npm run diagnose -- --mode demo --scenario-id preflight-liquidity-block --output-mode operator
cat payload.json | npm run diagnose -- --output-mode backend
```

## Documentation index

- [Architecture](docs/architecture.md)
- [Failure modes](docs/failure-modes.md)
- [Contracts](docs/contracts.md)
- [Runtime model](docs/runtime-model.md)
- [Local lab runbook](docs/local-lab-runbook.md)
- [End-to-end validation](docs/e2e-validation.md)

## Demo media

- Judge walkthrough script: `docs/e2e-validation.md#guided-judge-demo`
- Hosted demo instructions: `docs/local-lab-runbook.md`

## Runtime policy and persistence

Environment variables and runtime assumptions:

- `FIBER_RPC_URL` / `FIBER_RPC_URL_NODE2`: default local lab endpoints
- `FIBEROPS_NODE_SET_JSON`: explicit multi-node live configuration
- `FIBEROPS_HISTORY_PATH`: enables backend history persistence when set
- `FIBEROPS_MAX_JSON_BODY_BYTES`: JSON API body limit
- `FIBEROPS_ALLOW_EXTERNAL_LIVE_ENDPOINTS=true`: allow non-loopback live endpoints
- `FIBEROPS_ALLOW_INSECURE_TOKEN_FORWARDING=true`: allow bearer tokens to non-HTTPS/non-loopback endpoints
- `FIBEROPS_ROUTE_PROBE_ENABLED=false`: disable live route probing

Persistence states:

- disabled: `FIBEROPS_HISTORY_PATH` is unset
- enabled/healthy: path is configured and reads/writes succeed
- enabled/degraded: path is configured but history read/write fails; diagnosis still succeeds and history remains non-fatal

Backend history writes are serialized and written through unique temp files so concurrent requests do not race on the persistence file.

## Live mode notes

- Fiber RPC uses JSON-RPC over HTTP
- methods with no arguments send `params: []`
- if auth is enabled, use a read-scoped Biscuit bearer token
- request aborts now propagate through live diagnostics into RPC fetches
- multi-node live diagnostics now run concurrently with a bounded fan-out
- `tests/live-integration.test.js` remains opt-in

## External references

- [RPC Overview](https://www.fiber.world/docs/api-reference)
- [Troubleshooting](https://www.fiber.world/docs/faq/troubleshooting)
- [JavaScript SDK](https://www.fiber.world/docs/build/sdk/js)
