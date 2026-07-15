# End-to-end validation

## Related docs

- [Developer guide](./developer-guide.md)
- [Local lab runbook](./local-lab-runbook.md)
- [Contracts](./contracts.md)
- [Release process](./release-process.md)

## Local setup

```bash
npm ci
npm run lab:reset
npm run lab:prepare
npm run lab:check
```

## Quality gates

```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run test:node
npx playwright install chromium
npm run test:browser
npm test
```

## API validation

Check the following routes manually or with a REST client:

- `GET /api/bootstrap`
- `GET /api/contracts/diagnose`
- `GET /api/contracts/diagnose/request`
- `GET /api/contracts/diagnose/result`
- `GET /api/contracts/diagnose/rules`
- `POST /api/diagnose`

Verify that:

- bootstrap returns capabilities, environment metadata, and contract endpoints
- contract endpoints return published schemas/rules
- live diagnose returns execution metadata for the resolved node set
- non-2xx responses return structured error envelopes

## Browser smoke

```bash
npm run test:browser
```

Current smoke coverage includes:

- guided happy path
- Lab workspace rendering from environment facts
- live manual workflow with explicit `analysisDepth=deep`
- bootstrap failure rendering
- diagnose failure rendering for non-2xx responses

On some restricted macOS sandboxes, Playwright may be unable to start a browser process at all. In that case the smoke script reports a skip instead of a false application failure.

## Guided judge demo

Do not walk through every page in sequence.

Use the story-first demo order from [Judge demo narrative](./judge-demo.md):

1. Healthy payment baseline
2. Low-liquidity failure
3. Offline-node failure
4. Route-not-found or fee-budget failure
5. Replay recent investigation
6. Live-mode proof against real Fiber nodes or the bundled lab

Use the `Simulations` workspace buttons for the replay scenarios so the demo remains deterministic under presentation conditions. The app now exposes these directly as one-click buttons instead of requiring manual form entry first.

## Optional live-lab validation

```bash
npm run test:live
```

This remains opt-in and requires the local lab plus any required environment variables.

## Hosted judging validation

If you deploy FiberOps to a VPS for judges:

1. follow [VPS judging deployment](./vps-judging-deploy.md)
2. verify `GET /api/health`
3. verify `GET /api/bootstrap`
4. confirm Fiber RPC ports are not published publicly
5. run the judge story from [Judge demo narrative](./judge-demo.md)
