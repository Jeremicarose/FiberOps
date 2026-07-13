# Security Policy

FiberOps interacts with live RPC endpoints, request payloads, and optional bearer tokens. Security-sensitive findings should be reported privately when possible.

## Supported Versions

Security fixes are best-effort for:

- the current `main` branch
- the most recent tagged `v0.x` release, once tagged releases exist

Older snapshots may not receive fixes.

## Reporting A Vulnerability

Please avoid filing public issues for vulnerabilities that could expose secrets, tokens, or live infrastructure details.

Preferred path:

1. Use GitHub private vulnerability reporting if it is enabled for the repository.
2. If it is not enabled, contact the maintainer privately through the repository profile and include `FiberOps security` in the subject.
3. If neither option is available, open a minimal public issue without exploit details and request a private contact channel.

Include:

- affected version or commit
- reproduction steps
- impact assessment
- whether credentials or private node details are involved

## Operational Guidance

- Do not commit live bearer tokens, `.env` files, or generated runtime secrets.
- Keep `FIBEROPS_ALLOW_INSECURE_TOKEN_FORWARDING=false` unless you have an explicit trusted-network reason.
- Review request-policy settings before exposing FiberOps outside a local or loopback environment.
