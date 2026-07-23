#!/usr/bin/env bash
# Runs services/stem-worker (Python, outside the pnpm workspace - see its
# README-less pyproject.toml) with auto-reload, mirroring `pnpm --filter api
# dev`'s watch behavior for the TS apps.
set -euo pipefail

cd "$(dirname "$0")/../services/stem-worker"

if [ ! -d .venv ]; then
  echo "No .venv found in services/stem-worker - set it up first:"
  echo "  cd services/stem-worker"
  echo "  python3.12 -m venv .venv"
  echo "  .venv/bin/pip install ."
  echo "Then copy .env.example to .env and fill it in (see scripts/garage-init.sh for the S3 credentials)."
  exit 1
fi

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
