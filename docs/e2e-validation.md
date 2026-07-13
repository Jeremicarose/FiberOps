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

1. Load the app.
2. Use the guided story cards in the UI.
3. Show preflight block, failure explanation, and success baseline.
4. Confirm results and route preview are visible in the Results workspace.

## Optional live-lab validation

```bash
npm run test:live
```

This remains opt-in and requires the local lab plus any required environment variables.
