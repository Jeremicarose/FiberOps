# Contracts

## Related docs

- [Developer guide](./developer-guide.md)
- [Architecture](./architecture.md)
- [Runtime model](./runtime-model.md)
- [End-to-end validation](./e2e-validation.md)

FiberOps exposes a schema-driven diagnostics contract and publishes it over HTTP.

## Endpoints

- `GET /api/contracts/diagnose`
- `GET /api/contracts/diagnose/request`
- `GET /api/contracts/diagnose/result`
- `GET /api/contracts/diagnose/rules`

These endpoints are wired in `src/lib/server-app.js` and sourced from `src/lib/diagnostics/contracts.js`.

Bootstrap discovery at `GET /api/bootstrap` mirrors the same contract metadata so consumers can discover versions and capabilities before their first diagnose request.

## Request contract

`POST /api/diagnose` accepts fields such as:

- `mode`: `demo` or `live`
- `scenarioId`
- `invoice`
- `paymentHash`
- `amount`
- `targetPubkey`
- `endpoint`
- `token`
- `timeoutMs`
- `analysisDepth`
- `outputMode`

Validation is strict for unknown top-level request fields and supported enum values.

## Result contract

The canonical result includes:

- `contract`
- `source`
- `diagnosis`
- `summary`
- `routePreview`
- `alerts`
- `event`
- `analyzedAt`

The `contract` block now carries additive metadata beyond the canonical version string:

- `version`
- `schemaSet.name`
- `schemaSet.version`
- `compatibility.current`
- `compatibility.backwardCompatibleWith`
- `capabilities.features`
- `outputModes`

## Additive compatibility

The result schema intentionally leaves many nested sections permissive with `additionalProperties: true`.

This is deliberate:

- required top-level structure is validated
- nested objects can gain new fields without breaking consumers
- docs should not imply that every nested leaf is frozen

Consumers should treat the required top-level fields as stable and nested sections as additive.

The same compatibility metadata is returned consistently from:

- the contract bundle endpoint
- bootstrap contract discovery
- the canonical result `contract` block

## Output/export modes

Supported `outputMode` values:

- `full`
- `machine`
- `operator`
- `backend`
- `wallet`

`full` returns the canonical diagnosis result. The other modes are adapter views produced from that canonical result.

Supported `analysisDepth` values:

- `standard`
- `deep`

`standard` preserves the fast, compatible live path. `deep` opt-ins to `graph_channels` and `build_router` analysis.

## Execution metadata

Live results now add execution metadata without breaking the canonical top-level contract:

- `selectedNodeId`
- `aggregateStatus`
- `execution.scope`
- `execution.analysisDepth`
- `execution.nodes[]`

This metadata reflects the resolved node set that was actually validated and contacted, not just the raw request payload.

## Error envelope

All API errors use the same shape:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid diagnosis request.",
    "details": {}
  },
  "meta": {
    "route": "/api/diagnose",
    "requestId": "req-..."
  }
}
```

The browser client consumes these envelopes directly and falls back to HTTP status-based failures if parsing fails.
