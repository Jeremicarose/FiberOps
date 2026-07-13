# Contributing

FiberOps is a read-only diagnostics console for Fiber on CKB. Contributions should make the operator story clearer, the diagnostics more trustworthy, or the repository easier to maintain.

## Development Setup

```bash
npm ci
npx playwright install chromium
npm run lab:reset
npm run lab:prepare
npm run lab:check
```

Use `npm run dev` for the browser app and `npm run diagnose -- --help` for CLI usage.

## Branch Naming

Use short, intent-revealing branch names with one of these prefixes:

- `feat/<topic>` for new functionality
- `fix/<topic>` for bug fixes
- `docs/<topic>` for documentation-only changes
- `chore/<topic>` for maintenance work
- `release/<version>` for release preparation

Examples:

- `feat/multi-node-history`
- `fix/route-preview-blocking-copy`
- `docs/release-process`

## Commit Messages

Prefer explicit imperative summaries over placeholders like `update`, `changes`, or `fix stuff`.

Good examples:

- `add ndjson history backend support`
- `fix demo diagnosis route-preview regression`
- `document release tagging workflow`

Conventional Commit prefixes are welcome but not required if the message is already specific.

## Pull Requests

Before opening a pull request:

1. Explain the operator problem or maintenance goal being solved.
2. Link the relevant issue when one exists.
3. Update docs, examples, and screenshots when behavior changes.
4. Run the full validation path:

```bash
npm run check
```

If the change touches only one area, include the focused command you used as a fast feedback loop, such as `npm run test:diagnostics`.

## Testing Expectations

- `npm run lint` for source hygiene
- `npm run format:check` for formatting
- `npm run typecheck` for API surface drift
- `npm run test:node` for Node-based tests
- `npm run test:browser` for browser smoke coverage
- `npm run test:live` only when you have a prepared local lab and intend to validate live RPC behavior

## Documentation Expectations

Touch documentation whenever you change:

- public API contracts
- CLI flags or output shapes
- runtime configuration
- onboarding steps
- visible browser behavior

Relevant docs live in `docs/`, `.env.example`, and `examples/`.

## Release And Tagging

FiberOps is pre-1.0. Until a more formal policy exists:

1. Keep `CHANGELOG.md` up to date.
2. Ensure `npm run check` passes on `main`.
3. Tag releases as `v0.x.y`.
4. Use prerelease tags like `v0.x.y-rc.1` for release candidates.
5. Keep the package version in `package.json` aligned with the intended release tag.

See `docs/release-process.md` for the lightweight release checklist.
