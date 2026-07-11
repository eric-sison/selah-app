#!/usr/bin/env bash
# One-time bootstrap for the local Garage (S3-compatible storage) container.
# Unlike Postgres/Mailpit, a fresh Garage node has no cluster layout and no
# bucket/key until this runs once. Safe to re-run: it skips steps that were
# already done and re-prints the existing key's secret instead of failing.
set -euo pipefail

BUCKET="selah-songs"
KEY_NAME="selah-api-key"
GARAGE="docker compose exec -T garage /garage"

echo "Waiting for garage to be ready..."
until $GARAGE status >/dev/null 2>&1; do
  sleep 1
done

if $GARAGE layout show | grep -q "No nodes"; then
  NODE_ID=$($GARAGE node id -q | cut -d'@' -f1)
  echo "Assigning single-node layout for $NODE_ID..."
  $GARAGE layout assign -z dc1 -c 10G "$NODE_ID"
  $GARAGE layout apply --version 1
else
  echo "Cluster layout already assigned, skipping."
fi

if $GARAGE bucket list | grep -qw "$BUCKET"; then
  echo "Bucket '$BUCKET' already exists, skipping."
else
  echo "Creating bucket '$BUCKET'..."
  $GARAGE bucket create "$BUCKET"
fi

if $GARAGE key list | grep -q "$KEY_NAME"; then
  echo "Key '$KEY_NAME' already exists, re-printing its secret:"
  $GARAGE key info "$KEY_NAME" --show-secret
else
  echo "Creating key '$KEY_NAME'..."
  $GARAGE key create "$KEY_NAME"
fi

# --owner is required for bucket-level admin operations (e.g. the CORS policy
# `pnpm storage:configure-cors` sets - needed for the Web Audio API waveform
# to read cross-origin audio, unlike plain <audio> playback which doesn't
# care), not just object read/write.
$GARAGE bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME"

cat <<EOF

Garage is ready. Add these to apps/api/.env:

S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_BUCKET=$BUCKET
S3_ACCESS_KEY_ID=<Key ID from above>
S3_SECRET_ACCESS_KEY=<Secret key from above>

Then, from apps/api, run: pnpm storage:configure-cors
EOF
