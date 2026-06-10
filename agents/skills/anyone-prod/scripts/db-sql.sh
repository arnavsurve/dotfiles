#!/usr/bin/env bash
set -euo pipefail

# Run SQL against the Anyone production Postgres through an ephemeral SSM
# tunnel, using RDS IAM auth. No Pulumi needed (unlike
# apps/anyone/infra/scripts/db-connect.sh) — coordinates are discovered
# with the aws CLI at run time.
#
# Usage:
#   db-sql.sh -c "SELECT now()"
#   db-sql.sh -f triage.sql
#   DB_USER=developer_rw db-sql.sh -f fix.sql   # write role
#
# Env overrides: DB_USER, LOCAL_PORT, STATEMENT_TIMEOUT_MS, AWS_REGION.

if [ $# -eq 0 ]; then
  echo "usage: db-sql.sh <psql args, e.g. -c \"SELECT 1\" or -f file.sql>" >&2
  exit 2
fi

REGION="${AWS_REGION:-us-east-2}"
PG_USER="${DB_USER:-developer}"
DB_NAME=anyone
DB_PORT=5432
LOCAL_PORT="${LOCAL_PORT:-15433}"
# Stable unless the RDS instance is rebuilt; re-discovered below when the
# caller has rds:DescribeDBInstances.
FALLBACK_DB_HOST=anyone-production-db.cpohlc3pkbyq.us-east-2.rds.amazonaws.com

# macOS keg-only libpq
[ -d /opt/homebrew/opt/libpq/bin ] && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
command -v psql >/dev/null 2>&1 || { echo "psql not found (macOS: brew install libpq)" >&2; exit 1; }
command -v session-manager-plugin >/dev/null 2>&1 || { echo "session-manager-plugin not found (macOS: brew install --cask session-manager-plugin)" >&2; exit 1; }

if (echo > "/dev/tcp/127.0.0.1/${LOCAL_PORT}") 2>/dev/null; then
  echo "127.0.0.1:${LOCAL_PORT} already in use — set LOCAL_PORT to a free port" >&2
  exit 1
fi

# The bastion is replaced on deploys — always discover the newest running one.
BASTION="$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values=anyone-production-bastion Name=instance-state-name,Values=running \
  --query 'sort_by(Reservations[].Instances[], &LaunchTime)[-1].InstanceId' --output text)"
if [ -z "$BASTION" ] || [ "$BASTION" = "None" ]; then
  echo "no running anyone-production-bastion instance found in ${REGION}" >&2
  exit 1
fi

DB_HOST="$(aws rds describe-db-instances --region "$REGION" \
  --db-instance-identifier anyone-production-db \
  --query 'DBInstances[0].Endpoint.Address' --output text 2>/dev/null || true)"
if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "None" ]; then
  DB_HOST="$FALLBACK_DB_HOST"
fi

# Token is bound to (host, port, user) and lasts 15 min; RDS only checks it
# at connection time.
TOKEN="$(aws rds generate-db-auth-token --region "$REGION" \
  --hostname "$DB_HOST" --port "$DB_PORT" --username "$PG_USER")"

SSM_LOG="$(mktemp -t anyone-db-ssm.XXXXXX)"
aws ssm start-session --region "$REGION" --target "$BASTION" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"$DB_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
  > "$SSM_LOG" 2>&1 &
SSM_PID=$!
cleanup() {
  kill "$SSM_PID" 2>/dev/null || true
  wait "$SSM_PID" 2>/dev/null || true
  rm -f "$SSM_LOG"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if (echo > "/dev/tcp/127.0.0.1/${LOCAL_PORT}") 2>/dev/null; then
    break
  fi
  if ! kill -0 "$SSM_PID" 2>/dev/null; then
    echo "SSM session exited before the tunnel came up:" >&2
    cat "$SSM_LOG" >&2
    exit 1
  fi
  sleep 0.5
done

# This hits the primary, not a replica — keep runaway queries bounded.
export PGOPTIONS="-c statement_timeout=${STATEMENT_TIMEOUT_MS:-120000}"
PGPASSWORD="$TOKEN" psql -X -v ON_ERROR_STOP=0 \
  "host=127.0.0.1 port=${LOCAL_PORT} dbname=${DB_NAME} user=${PG_USER} sslmode=require" \
  "$@"
