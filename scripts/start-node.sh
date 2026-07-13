#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <node-name>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_NAME="$1"
NODE_DIR="$ROOT_DIR/runtime/$NODE_NAME"

if [[ ! -x "$NODE_DIR/fnn" ]]; then
  echo "Missing $NODE_DIR/fnn. Run npm run lab:prepare first." >&2
  exit 1
fi

if [[ -z "${FIBER_SECRET_KEY_PASSWORD:-}" ]]; then
  echo "FIBER_SECRET_KEY_PASSWORD is required." >&2
  exit 1
fi

export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}"

cd "$NODE_DIR"
exec ./fnn -c ./config.yml -d .
