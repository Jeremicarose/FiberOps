# Local lab runbook

## Canonical bootstrap flow

```bash
npm install
npm run lab:reset
npm run lab:prepare
npm run lab:check
npm run dev
```

Open `http://localhost:3000` after `npm run dev` starts the app.

## What each command does

- `lab:reset` — removes generated state under `runtime/` and `vendor/`
- `lab:prepare` — extracts and syncs portable `fnn` artifacts, generates configs, and writes `runtime/manifest.json`
- `lab:check` — verifies archive availability, vendor/runtime structure, manifest integrity, and optional RPC health if nodes are running

## Generated artifacts

`lab:prepare` produces:

- `vendor/fnn/`
- `runtime/node1/`
- `runtime/node2/`
- `runtime/manifest.json`

## Starting the nodes

```bash
FIBER_SECRET_KEY_PASSWORD=your-password ./scripts/start-node1.sh
FIBER_SECRET_KEY_PASSWORD=your-password ./scripts/start-node2.sh
```

## Safety notes

- `lab:reset` only targets generated local-lab state
- runtime artifacts are gitignored and expected to be disposable
- live integration tests remain opt-in

## Troubleshooting

- If `lab:check` reports a missing archive, set `FIBEROPS_FNN_ARCHIVE`
- If RPC health checks warn, start the nodes and rerun `lab:check`
- If the app loads in degraded bootstrap mode, confirm `GET /api/bootstrap` succeeds and returns JSON
