#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_DIR="$ROOT_DIR/runtime/node2"

if [[ ! -x "$NODE_DIR/fnn" ]]; then
  echo "Missing $NODE_DIR/fnn. Set up the node bundle first." >&2
  exit 1
fi

if [[ -z "${FIBER_SECRET_KEY_PASSWORD:-}" ]]; then
  echo "FIBER_SECRET_KEY_PASSWORD is required." >&2
  exit 1
fi

export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}"

cd "$NODE_DIR"
exec ./fnn -c ./config.yml -d .
