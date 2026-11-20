#!/usr/bin/env bash
# Build the runtime image and run migrate + api + simulation + worker via the
# compose `apps` profile; require every /health/ready to return 200, then stop
# the app containers. Infrastructure containers are left as they were.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { docker compose --profile apps rm --force --stop migrate api simulation worker >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker compose --profile apps up --build --detach --wait api simulation worker

status=0
for port in 3000 3001 3002; do
  body="$(curl --silent --show-error --max-time 5 --write-out ' HTTP:%{http_code}' "http://127.0.0.1:${port}/health/ready" || true)"
  if [[ "$body" == *'"status":"ok"'*' HTTP:200' ]]; then
    echo "✓ :${port} ready"
  else
    echo "✗ :${port} not ready: ${body}"; status=1
  fi
done

if [[ $status -ne 0 ]]; then docker compose --profile apps logs --no-color migrate api simulation worker | tail -n 80; fi
exit $status
