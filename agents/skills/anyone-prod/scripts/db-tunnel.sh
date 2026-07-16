#!/usr/bin/env bash
set -euo pipefail

# Hold an SSM tunnel to the Anyone production Postgres open for GUI clients
# (Postico / DBeaver / TablePlus). Same no-Pulumi coordinate discovery as
# db-sql.sh; same hold-open behavior as the escher repo's
# apps/anyone/infra/scripts/db-connect.sh --tunnel.
#
# Usage:
#   db-tunnel.sh                     # read-only role (developer)
#   db-tunnel.sh --write             # read/write role (developer_rw)
#   db-tunnel.sh --user <pg-role>    # custom role
#   db-tunnel.sh --local-port <port> # default 15432 (stable for saved client profiles)
#
# The IAM auth token (the password) lasts 15 minutes and is only checked at
# connection time — open connections outlive it, but new ones (new DBeaver
# SQL editors, reconnects) need a fresh token. Press Enter to mint + copy a
# fresh one without dropping the tunnel.

REGION="${AWS_REGION:-us-east-2}"
DB_NAME=anyone
DB_PORT=5432
# Stable unless the RDS instance is rebuilt; re-discovered below when the
# caller has rds:DescribeDBInstances.
FALLBACK_DB_HOST=anyone-production-db.cpohlc3pkbyq.us-east-2.rds.amazonaws.com

pg_user=""
pg_user_explicit=""
want_write=0
local_port="${LOCAL_PORT:-15432}"

while [ $# -gt 0 ]; do
  case "$1" in
    --write)      want_write=1; shift ;;
    --user)       pg_user_explicit="$2"; shift 2 ;;
    --local-port) local_port="$2"; shift 2 ;;
    -h|--help)
      sed -n '4,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $(basename "$0") [--write] [--user <pg-role>] [--local-port <port>]" >&2
      exit 2
      ;;
  esac
done

if [ -n "$pg_user_explicit" ]; then
  if [ "$want_write" = 1 ]; then
    echo "--user and --write are mutually exclusive" >&2
    exit 2
  fi
  pg_user="$pg_user_explicit"
elif [ "$want_write" = 1 ]; then
  pg_user="developer_rw"
else
  pg_user="developer"
fi

command -v session-manager-plugin >/dev/null 2>&1 \
  || { echo "session-manager-plugin not found (macOS: brew install --cask session-manager-plugin)" >&2; exit 1; }

copy_to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then wl-copy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then xsel -ib
  else return 1
  fi
}

# BSD date (-r epoch) vs GNU date (-d @epoch)
fmt_time() {
  if date -r 0 +%s >/dev/null 2>&1; then date -r "$1" +%H:%M; else date -d "@$1" +%H:%M; fi
}

port_busy() { (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if port_busy "$local_port"; then
  echo "127.0.0.1:${local_port} is already in use — an earlier tunnel may still be up (connect to it, or kill it):" >&2
  lsof -nP -iTCP:"$local_port" -sTCP:LISTEN >&2 || true
  echo "Or pick another port: $(basename "$0") --local-port <port>" >&2
  exit 1
fi

# The bastion is replaced on deploys — always discover the newest running one.
# This is also the first real AWS call, so it doubles as the auth check
# (generate-db-auth-token signs locally and won't catch expired creds).
BASTION="$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values=anyone-production-bastion Name=instance-state-name,Values=running \
  --query 'sort_by(Reservations[].Instances[], &LaunchTime)[-1].InstanceId' --output text)" \
  || { echo "bastion discovery failed — AWS session expired? Try: aws login" >&2; exit 1; }
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

# Token is bound to (host, port, user); RDS validates against the real RDS
# endpoint, not the localhost address the client dials through the tunnel.
mint_token() {
  aws rds generate-db-auth-token --region "$REGION" \
    --hostname "$DB_HOST" --port "$DB_PORT" --username "$pg_user"
}

SSM_LOG="$(mktemp -t anyone-db-tunnel-ssm.XXXXXX)"
aws ssm start-session --region "$REGION" --target "$BASTION" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"$DB_PORT\"],\"localPortNumber\":[\"$local_port\"]}" \
  > "$SSM_LOG" 2>&1 &
SSM_PID=$!

cleanup() {
  if kill -0 "$SSM_PID" 2>/dev/null; then
    kill "$SSM_PID" 2>/dev/null || true
    wait "$SSM_PID" 2>/dev/null || true
  fi
  rm -f "$SSM_LOG"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for _ in $(seq 1 40); do
  if port_busy "$local_port"; then
    break
  fi
  if ! kill -0 "$SSM_PID" 2>/dev/null; then
    echo "SSM session exited before the tunnel came up:" >&2
    cat "$SSM_LOG" >&2
    exit 1
  fi
  sleep 0.5
done

role_note="(read-only)"
[ "$pg_user" = "developer_rw" ] && role_note="(READ/WRITE — careful, this is prod)"

show_token() {
  local token expiry copied=""
  token="$(mint_token)"
  expiry="$(fmt_time $(( $(date +%s) + 900 )))"
  if printf %s "$token" | copy_to_clipboard 2>/dev/null; then
    copied=" — copied to clipboard"
  fi
  echo
  echo "IAM auth token (valid 15 min, until ${expiry})${copied}:"
  echo
  echo "$token"
}

cat <<EOF

Tunnel up: 127.0.0.1:${local_port} -> ${DB_HOST}:${DB_PORT}

  Host:     127.0.0.1
  Port:     ${local_port}
  Database: ${DB_NAME}
  User:     ${pg_user}   ${role_note}
  Password: the IAM token below
  SSL:      require   (RDS rejects unencrypted IAM-auth connections)
EOF
show_token
cat <<'EOF'

This is the production PRIMARY (no read replica) — keep ad-hoc queries cheap.
Open connections outlive the token; new connections (new DBeaver SQL editors,
reconnects) need a fresh one.

Press Enter to mint + copy a fresh token · Ctrl+C to close the tunnel.
EOF

if [ -t 0 ]; then
  while IFS= read -r _; do
    if ! kill -0 "$SSM_PID" 2>/dev/null; then
      echo "Tunnel died (SSM sessions idle out after ~20 min without traffic). Log:" >&2
      cat "$SSM_LOG" >&2
      exit 1
    fi
    show_token
  done
fi
wait "$SSM_PID"
