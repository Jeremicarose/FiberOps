# VPS Judging Deployment

FiberOps is easiest to demonstrate to judges as:

- one public **FiberOps** web app
- one or two real **Fiber nodes**
- **Fiber RPC kept private** to the VPS loopback interface

This guide sets up that shape.

## Goals

- judges open one public URL
- FiberOps can query a real Fiber node
- raw Fiber RPC is not exposed publicly
- replay mode remains available if live node conditions drift

## Topology

This deployment uses **host networking** on Linux so Fiber nodes can keep RPC on loopback and FiberOps can still reach them safely.

### One-node judging stack

- `fiberops`
  - public on port `3000`
  - runs with host networking
- `fiber-node`
  - P2P listens on host port `8228`
  - RPC listens on `127.0.0.1:8227`
  - RPC is private to the VPS

### Optional two-node stack

- `fiberops`
- `fiber-node`
  - P2P public port `8228`
  - private RPC `127.0.0.1:8227`
- `fiber-node-2`
  - P2P public port `8238`
  - private RPC `127.0.0.1:8237`

FiberOps receives the two-node set through `FIBEROPS_NODE_SET_JSON` in the override compose file.

## Files added for this flow

- `Dockerfile`
- `deploy/vps/docker-compose.yml`
- `deploy/vps/docker-compose.two-node.yml`
- `deploy/vps/judging.env.example`
- `deploy/vps/fiber-config.template.yml`
- `scripts/prepare-vps-stack.mjs`

## Prerequisites

- a Linux VPS
- Docker and Docker Compose plugin
- this repository checked out on the VPS
- Fiber key material for each node you plan to run

## Prepare the stack

### One node

```bash
npm run deploy:vps:prepare
cp deploy/vps/judging.env.example deploy/vps/judging.env
```

### Two nodes

```bash
npm run deploy:vps:prepare:two-node
cp deploy/vps/judging.env.example deploy/vps/judging.env
```

The prepare script renders:

- `deploy/vps/state/node1/config.yml`
- optional `deploy/vps/state/node2/config.yml`
- `deploy/vps/state/fiberops/`

## Add node key material

Place the required Fiber key material under:

- `deploy/vps/state/node1/ckb/`
- `deploy/vps/state/node2/ckb/` when using two nodes

At minimum, the node data directory must contain whatever `fnn` needs to unlock and run with the configured secret key password.

## Configure secrets

Edit `deploy/vps/judging.env`:

```bash
FIBEROPS_PUBLIC_PORT=3000
FIBEROPS_HISTORY_BACKEND=ndjson-file
FIBER_NODE_IMAGE=nervos/fiber:0.9.0-rc7
FIBER_NODE1_P2P_PUBLIC_PORT=8228
FIBER_NODE2_P2P_PUBLIC_PORT=8238
FIBER_NODE1_SECRET_KEY_PASSWORD=replace-me
FIBER_NODE2_SECRET_KEY_PASSWORD=replace-me
```

If you only run one node, `FIBER_NODE2_SECRET_KEY_PASSWORD` can stay unused.

## Start the stack

### One node

```bash
docker compose \
  --env-file deploy/vps/judging.env \
  -f deploy/vps/docker-compose.yml \
  up -d --build
```

### Two nodes

```bash
docker compose \
  --env-file deploy/vps/judging.env \
  -f deploy/vps/docker-compose.yml \
  -f deploy/vps/docker-compose.two-node.yml \
  up -d --build
```

## Verify

### FiberOps health

```bash
curl http://127.0.0.1:3000/api/health
```

Expected:

- `ok: true`
- default endpoint points at `http://127.0.0.1:8227`

### FiberOps bootstrap

```bash
curl http://127.0.0.1:3000/api/bootstrap
```

Expected:

- scenarios present
- live presets present
- environment metadata present

### RPC is not public

From outside the VPS, **do not** expose:

- `8227`
- `8237`

Publicly reachable:

- `3000` for FiberOps
- `8228` and optional `8238` for Fiber P2P

## Firewall / networking

Allow inbound:

- `3000/tcp`
- `8228/tcp`
- optional `8238/tcp`

Do not allow inbound:

- `8227/tcp`
- `8237/tcp`

Because host networking is used, enforce these restrictions with the host firewall or provider firewall.

## Judge demo recommendation

Use the app like this:

1. start with replay scenarios in `Simulations`
2. show healthy payment
3. show low liquidity
4. show offline node
5. show route not found or fee too low
6. then switch to live mode and prove the app is connected to a real Fiber node

That gives judges both reliability and credibility.

## Operational notes

- the app is still read-only
- replay mode remains available if live state drifts
- history is stored under `deploy/vps/state/fiberops/`
- `ndjson-file` is the better judging backend because it is append-safe and does not rewrite the full file on every event

## Related upstream references

- Fiber Docker guide: `https://github.com/nervosnetwork/fiber/tree/develop/docker`
- Fiber native node guide: `https://www.fiber.world/docs/quick-start/run-a-node/rust`
- fiber-pay CLI quickstart: `https://github.com/RetricSu/fiber-pay/blob/master/packages/cli/docs/human-quickstart.md`
