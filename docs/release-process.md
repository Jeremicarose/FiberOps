# Release Process

## Related docs

- [README](../README.md)
- [Developer guide](./developer-guide.md)
- [End-to-end validation](./e2e-validation.md)

FiberOps does not have tagged releases yet. This file defines the baseline release workflow so the first release is consistent with later ones.

## Versioning

- Use `v0.x.y` for normal releases.
- Use `v0.x.y-rc.N` for release candidates.
- Keep the version in `package.json` aligned with the intended tag.

## Pre-Release Checklist

1. Ensure `CHANGELOG.md` has an entry for the release.
2. Run the full validation path:

```bash
npm run check
```

3. Review README, `.env.example`, and `examples/` for stale commands or payloads.
4. Confirm screenshots and docs still match the current UI and API behavior.
5. Merge through a reviewed pull request rather than pushing ad hoc release commits to `main`.

## Tagging

Create annotated tags:

```bash
git tag -a v0.x.y -m "FiberOps v0.x.y"
git push origin v0.x.y
```

For release candidates:

```bash
git tag -a v0.x.y-rc.1 -m "FiberOps v0.x.y-rc.1"
git push origin v0.x.y-rc.1
```

## Release Notes

Release notes should summarize:

- user-visible diagnosis changes
- API or contract changes
- new operational requirements
- testing or documentation updates
