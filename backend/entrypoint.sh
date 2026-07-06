#!/bin/sh
set -u

echo "Running prisma migrate deploy (max 30 attempts, 2s apart)..."
attempt=1
while ! npx prisma migrate deploy; do
  if [ "$attempt" -ge 30 ]; then
    echo "FATAL: migrate deploy failed after ${attempt} attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "migrate deploy failed; retrying (${attempt}/30) in 2s..." >&2
  sleep 2
done

exec node dist/index.js
