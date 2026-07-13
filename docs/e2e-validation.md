# End-to-end validation

## Local setup

```bash
npm install
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
- non-2xx responses return structured error envelopes

## Browser smoke

```bash
npm run test:browser
```

Current smoke coverage includes:

- guided happy path
- bootstrap failure rendering
- diagnose failure rendering for non-2xx responses

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
