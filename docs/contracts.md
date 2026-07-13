# Contracts

FiberOps exposes a schema-driven diagnostics contract and publishes it over HTTP.

## Endpoints

- `GET /api/contracts/diagnose`
- `GET /api/contracts/diagnose/request`
- `GET /api/contracts/diagnose/result`
- `GET /api/contracts/diagnose/rules`

These endpoints are wired in `src/lib/server-app.js` and sourced from `src/lib/diagnostics/contracts.js`.

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

## Additive compatibility

The result schema intentionally leaves many nested sections permissive with `additionalProperties: true`.

This is deliberate:

- required top-level structure is validated
- nested objects can gain new fields without breaking consumers
- docs should not imply that every nested leaf is frozen

Consumers should treat the required top-level fields as stable and nested sections as additive.

## Output/export modes

Supported `outputMode` values:

- `full`
- `machine`
- `operator`
- `backend`
- `wallet`

`full` returns the canonical diagnosis result. The other modes are adapter views produced from that canonical result.

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
    "route": "/api/diagnose"
  }
}
```

The browser client consumes these envelopes directly and falls back to HTTP status-based failures if parsing fails.
