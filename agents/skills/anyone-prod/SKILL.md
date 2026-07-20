---
name: anyone-prod
description: |
  Production access for Anyone incident triage: query the prod Postgres
  through the SSM bastion tunnel (no Pulumi needed) and search CloudWatch
  logs for the api/worker/proxy services. Use when debugging Anyone prod
  incidents — agents not replying, stuck or failed runs, "run not found"
  errors, channel/binding weirdness — or whenever prod DB rows or prod
  logs are needed.
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
---

# Anyone prod access (DB + CloudWatch)

Everything lives in `us-east-2`, AWS account `356503373039`. Requires an
authed `aws` CLI whose IAM principal is in the
`anyone-production-db-operators` group (read) or
`anyone-production-db-writers` (read + write).

## Prod Postgres via SSM tunnel

The DB is in a private subnet; the only way in is an SSM port-forward
through the `anyone-production-bastion` EC2 instance. Auth is RDS IAM — a
15-minute token minted from your AWS creds, no shared password. The
default role `developer` is read-only; `developer_rw` can write.

### scripts/db-sql.sh (bundled here — no Pulumi needed)

```bash
~/.agents/skills/anyone-prod/scripts/db-sql.sh -c "SELECT now()"
~/.agents/skills/anyone-prod/scripts/db-sql.sh -f /tmp/triage.sql
DB_USER=developer_rw ~/.agents/skills/anyone-prod/scripts/db-sql.sh -f fix.sql
```

Trailing args pass straight to psql. The script discovers the current
bastion by tag (it ROTATES on deploys — never hardcode an instance id),
resolves the RDS endpoint, mints the IAM token, opens the tunnel on
`LOCAL_PORT` (default 15433), runs psql, and tears the tunnel down.
`statement_timeout` defaults to 120s (`STATEMENT_TIMEOUT_MS` overrides).

One-time deps: `aws` CLI v2, `brew install --cask session-manager-plugin`,
`brew install libpq` (the script adds the keg-only path itself on macOS).

### scripts/db-tunnel.sh (GUI clients — no Pulumi needed)

Holds the tunnel open for Postico/DBeaver/TablePlus instead of running a
query. Same coordinate discovery as `db-sql.sh`; prints connection
details, copies the IAM token to the clipboard, and re-mints a fresh one
on Enter (tokens last 15 min and are only checked at connection time, so
open connections survive but new ones need a fresh token).

```bash
~/.agents/skills/anyone-prod/scripts/db-tunnel.sh          # read-only (developer)
~/.agents/skills/anyone-prod/scripts/db-tunnel.sh --write  # developer_rw
```

Default local port 15432 — deliberately stable (unlike db-sql.sh's
auto-advance) so saved GUI connection profiles keep working; errors if
busy. Aliased as `skydive-db` in the user's zshrc.

### db-connect.sh in the escher repo (canonical, needs Pulumi)

`apps/anyone/infra/scripts/db-connect.sh`:

Same mechanism plus a `--tunnel` mode that holds the port open for GUI
clients (Postico/DataGrip), but it resolves coordinates from
`pulumi stack output`, so it needs the pulumi CLI and a
`PULUMI_ACCESS_TOKEN`. The bundled scripts above mirror it without the
Pulumi dependency; prefer them when Pulumi auth isn't available.

### Gotchas

- Start SQL files with `\x auto` so wide rows render readably.
- All DB timestamps are UTC (`timestamptz`).
- An interrupted run can orphan its `session-manager-plugin` tunnel on
  15433. The script auto-advances to a free port (15433-15453) when
  `LOCAL_PORT` isn't set; clean up strays with
  `lsof -nP -iTCP:15433 -sTCP:LISTEN` → kill the PID.
- `Your session has expired. Please reauthenticate using 'aws login'` —
  the login is interactive; ask the user to run `aws login` themselves.
- The secret-service DB is intentionally unreachable from the bastion
  (network + IAM) — operate on it via the secret-service API.
- The `read-only-db-replica` Doppler project is the FLUX database, not
  Anyone. Anyone has no read replica; this tunnel hits the primary, so
  keep ad-hoc queries cheap and indexed.

## Triage queries

Tables are prefixed by domain (`messaging_*`, `agents_*`, `auth_*`,
`channels_*`, `jobs_*`); schema lives in the escher repo at
`apps/anyone/db/src/schema/`.
Run statuses: `queued`, `starting_sandbox`, `running`, `cancel_requested`,
`completed`, `failed`, `canceled`, `timed_out`, `interrupted`, `superseded`.

```sql
-- recent runs for an agent: status, errors, heartbeat
SELECT r.id, r.conversation_id, r.status, r.created_at, r.completed_at,
       r.last_heartbeat_at, r.error_message, r.agent_suppressed_reply
FROM messaging_assistant_run r
JOIN agents_agent a ON a.id = r.agent_id
WHERE a.name ILIKE '%<agent>%' AND r.created_at > now() - interval '24 hours'
ORDER BY r.created_at DESC;

-- conversation forensics: where it's bound (web convs have NO binding row;
-- slack external_thread_id is CHANNEL or CHANNEL:thread_ts), then messages.
-- User messages with a non-null run_id were steered into that in-flight run
-- (see also messaging_steering_directive.consumed_at).
SELECT channel, connector_id, external_thread_id, created_at
FROM messaging_channel_binding WHERE conversation_id = '<conv>';

SELECT created_at, role, status, run_id,
       left(regexp_replace(content::text, '\s+', ' ', 'g'), 140) AS preview
FROM messaging_message
WHERE conversation_id = '<conv>' AND created_at > now() - interval '24 hours'
ORDER BY created_at;

-- stuck runs: live status but stale heartbeat = orphaned worker job
SELECT id, agent_id, conversation_id, created_at, last_heartbeat_at
FROM messaging_assistant_run
WHERE status IN ('queued', 'starting_sandbox', 'running')
  AND created_at > now() - interval '7 days'
  AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - interval '5 minutes')
ORDER BY created_at DESC;
```

Known mislabel: a run that failed ~100ms after creation with
`error_message = 'run not found'` on a slack/email-bound conversation is
usually NOT a missing row — worker `hydrateRunContext` rejects non-web/cron
channel bindings for `chat-run-v1` jobs (web-composer sends into channel
conversations always fail this way). Confirm via the worker log line
`unexpected channel for chat-run-v1`.

## CloudWatch logs

| Service        | Log group                              |
| -------------- | -------------------------------------- |
| API            | `/anyone/anyone-production-api`        |
| Worker         | `/anyone/anyone-production-worker`     |
| Proxy          | `/anyone/anyone-production-proxy`      |
| Secret Service | `/anyone/anyone-production-secret-svc` |

Creds: ambient `aws` works if your principal has logs access; otherwise
prefix every command with
`doppler run --project cloudwatch-readonly --config prd --`.

Quick grep by id (run/conversation/agent/sandbox uuid) — fastest first move:

```bash
aws logs filter-log-events --region us-east-2 \
  --log-group-name /anyone/anyone-production-worker \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern '"<uuid>"' \
  --query 'events[].message' --output text | head -50
```

Logs Insights when you need sorting/aggregation (async — poll until
`status` is `Complete`):

```bash
QID=$(aws logs start-query --region us-east-2 \
  --log-group-name /anyone/anyone-production-worker \
  --start-time $(($(date +%s) - 7200)) --end-time $(date +%s) \
  --query-string 'fields @timestamp, msg, runId, err.message | filter level >= 40 | sort @timestamp desc | limit 50' \
  --output text --query queryId)
sleep 3
aws logs get-query-results --region us-east-2 --query-id "$QID"
```

Insights' `like` operator takes a plain substring or a bare regex — inline
flags reject the whole query (`like /mcp/i` → `MalformedQueryException`);
OR the case variants instead (`like /mcp/ or like /MCP/`).

Logs are pino JSON: `level` (30 info / 40 warn / 50 error), `module`,
`msg`, `runId`, `agentId`, `sandboxId`. Worker `streamChat event` lines
trace a run's lifecycle (`stream-id` → `tool-call-*` / `thinking-delta` /
`text-delta` → `done`); long gaps between `tool-execution-start` and the
next event mean the agent is inside one long tool call, not dead — check
`last_heartbeat_at` in the DB before assuming a hang. Mind timezones when
correlating: Insights prints UTC, some other tooling prints local time.

For Flux log groups, preview environments, and more Insights recipes, see
the escher repo's `cloudwatch-logs` skill.

## Related

- In-sandbox forensics (harness/proxy stdout, OOM kills) live in
  ClickHouse `sandbox_logs`, shipped by vector from every box and
  surviving sandbox death — creds in Doppler `anyone-api` prd
  (`CLICKHOUSE_*`). E2B's metrics API (CPU/mem) also works after a
  sandbox is deleted.
