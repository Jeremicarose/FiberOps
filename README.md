# FiberOps Diagnostics

FiberOps is a focused, read-only Fiber infrastructure tool for Category 2 style judging: it explains failed payments, previews route readiness before retry, surfaces operator-facing alerts, and records a lightweight incident timeline without pretending to be a full observability platform.

## Project summary

FiberOps stays narrow on purpose:

- diagnose why a Fiber payment failed
- preflight a payment attempt with a route preview
- surface infrastructure signals from node, channel, invoice, graph, and payment reads
- keep recent incident history in the UI for judge-visible operational context
- remain read-only in both demo and live modes

The core question is still:

> Why did this payment fail, and what should the operator do next?

## What is real vs mocked

### Real

- live mode talks to a real Fiber node over JSON-RPC
- local lab includes two local nodes in `runtime/node1` and `runtime/node2`
- live presets include:
  - a real successful payment hash
  - a real failed payment hash
  - live node state inspection
  - a real oversized invoice preflight path

### Mocked or heuristic

- bundled demo scenarios are local fixtures
- incident history is browser `localStorage`, not a server database
- route preview is currently heuristic-first and does not send payments
- alerting is derived from the latest snapshot, not background collectors

## Architecture

- `src/server.js`
  - serves the static app
  - exposes `GET /api/bootstrap` and `POST /api/diagnose`
  - packages the judge demo path with `liveStory`, `livePresets`, and local lab facts
- `src/lib/diagnostics.js`
  - runs the demo/live diagnostics pipeline
  - classifies failures
  - emits shared event envelopes
  - derives route preview, summary monitoring fields, and alerts
- `public/app.js`
  - renders the diagnostics result
  - stores recent incidents in local browser history
  - shows alerts, route preview, judge demo story, and timeline
- `public/index.html` + `public/styles.css`
  - present the operator dashboard UI
- `tests/diagnostics.test.js`
  - covers diagnosis, event, route preview, alerts, and summary fields

## API behavior

### `GET /api/bootstrap`
Returns:

- default Fiber endpoint
- bundled demo scenarios
- judge demo path via `liveStory`
- local proof presets via `livePresets`
- local lab facts for the two-node setup

### `POST /api/diagnose`
Returns additive, read-only diagnostics output including:

- `diagnosis`
- `summary`
- `routePreview`
- `alerts`
- `event`
- `scenario`
- `analyzedAt`

In live mode, FiberOps only reads from Fiber RPC:

- `node_info`
- `list_channels`
- `parse_invoice`
- `graph_nodes`
- `get_payment`

## Judge demo path

Use the existing guided story in the UI:

1. **Preflight catches the problem**
   - run the oversized invoice preset
   - show `routePreview.status = blocked`
   - show outbound liquidity vs requested amount
2. **Real failure explains why**
   - run the stored failed payment hash from node1
   - show diagnosis, alerts, and the incident timeline entry
3. **Real success proves the channel works**
   - run the stored successful payment hash from node1
   - show healthy status with another timeline entry

After that, use the live presets to inspect node1/node2 state if judges ask follow-up questions.

## Local run

```bash
npm test
npm run dev
```

Then open:

```text
http://localhost:3000
```

Optional environment variables:

```bash
FIBER_RPC_URL=http://127.0.0.1:8227
FIBER_RPC_URL_NODE2=http://127.0.0.1:8237
```

## Hosted demo

If you deploy the app, keep the hosted demo framed as read-only:

- use demo scenarios when live lab access is not available
- point judges to the built-in `Judge demo path`
- clearly label that incident history is client-side only
- if live RPC is exposed, secure it with a Biscuit bearer token and limit it to read access

## Local Fiber lab

Primary local node:

```text
runtime/node1
```

Secondary local node:

```text
runtime/node2
```

Endpoints:

```text
http://127.0.0.1:8227
http://127.0.0.1:8237
```

Start them again with:

```bash
FIBER_SECRET_KEY_PASSWORD=your-password ./scripts/start-node1.sh
FIBER_SECRET_KEY_PASSWORD=your-password ./scripts/start-node2.sh
```

Verify RPC directly:

```bash
curl -sS http://127.0.0.1:8227 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"node_info"}'
```

Or through the bundled CLI:

```bash
NO_PROXY=127.0.0.1,localhost runtime/node1/fnn-cli info --output-format json
```

Current proof points:

- a working local two-node setup on testnet
- `node1` RPC: `http://127.0.0.1:8227`
- `node2` RPC: `http://127.0.0.1:8237`
- one public local channel is `ChannelReady`
- successful payment hash:
  - `0x729f0879b24702a9226ebb35bbcbbbdcca0eb859addc62da1f121dc1c20df209`
- failed payment hash:
  - `0x7bfb24cba169ec57a1743d4b0ed35b522a4dfbd5d9d04626aef866d82d9cd845`
- known failure:
  - `Insufficient balance: max outbound liquidity 30100000000 is insufficient, required amount: 35000000000`

## Technical breakdown for submission

- **Diagnostics engine**: rule-based failure classification over payment, invoice, channel, graph, and node snapshots
- **Infrastructure signals**: broader summary metrics for open/ready channels, peer count, readiness, outbound liquidity, and partial RPC degradation
- **Operational UX**: alert cards, route preflight preview, and local incident timeline
- **Read-only safety**: no payment sending, no server-side collectors, no alert integrations, no persistence backend
- **Demo packaging**: guided local proof flow embedded directly in the app using the existing live story and presets

## Live mode assumptions

- Fiber RPC uses JSON-RPC over a single HTTP endpoint
- methods with no arguments send `params: []`
- if auth is enabled, the UI accepts a Biscuit bearer token

Relevant docs:

- [RPC Overview](https://www.fiber.world/docs/api-reference)
- [Troubleshooting](https://www.fiber.world/docs/faq/troubleshooting)
- [JavaScript SDK](https://www.fiber.world/docs/build/sdk/js)
