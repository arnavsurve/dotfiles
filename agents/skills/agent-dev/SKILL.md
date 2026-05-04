---
name: agent-dev
description: Dev server process manager for AI agents. Use when the user needs to start, stop, restart, or manage a development server running in the background. Triggers include requests to "start the dev server", "run the dev server", "stop the server", "restart the server", "check if the server is running", "search the server logs", or any task requiring a background dev server process.
allowed-tools: Bash(agent-dev:*)
---

# Dev Server Management with agent-dev

A lightweight CLI for managing dev server processes as background daemons. Spawns processes detached, captures stdout/stderr to searchable logs, and tracks sessions via PID files in `~/.agent-dev/`.

## Core Workflow

1. **Start**: `agent-dev run <command> [args...]` — daemonize the process, get a session ID
2. **Check**: `agent-dev status` — see if it's running
3. **Search**: `agent-dev search <terms>` — grep the logs
4. **Restart**: `agent-dev restart` — stop and re-run with the same command
5. **Stop**: `agent-dev stop` — kill the session and clean up
6. **Logs**: `agent-dev logs` — get the log file path

All output is JSON for easy parsing.

## Commands

```bash
# Start a dev server in the background
agent-dev run npm run dev
agent-dev run python3 -m http.server 8080
agent-dev run next dev --port 3000

# Named sessions
agent-dev --session myapp run npm run dev
agent-dev --session api run node server.js

# With portless (stable HTTPS .localhost URLs)
agent-dev --session myapp --portless run npm run dev
# => https://myapp.localhost

# Check running session
agent-dev status
# {"session":"myapp","pid":12345,"running":true,"cmd":"npm run dev","name":"myapp","url":"https://myapp.localhost"}

# Search server logs for errors, URLs, or any text
agent-dev search "error"
agent-dev search "listening on"
agent-dev --session myapp search "ready"

# Show log file path
agent-dev logs
agent-dev --session myapp logs

# Restart with the same command (preserves session name and portless)
agent-dev restart
agent-dev --session myapp restart

# Stop the running server
agent-dev stop
agent-dev --session myapp stop
```

## Flags and Environment Variables

| Flag | Env | Description |
|------|-----|-------------|
| `--session <name>` | `AGENT_DEV_SESSION` | Name the session (default: random id) |
| `--portless` | `AGENT_DEV_PORTLESS=1` | Route through portless (`https://<name>.localhost`) |
| | `AGENT_DEV_LOG_DIR` | Custom state/log directory (default: `~/.agent-dev`) |

## Common Patterns

### Start and verify

```bash
agent-dev --session myapp run npm run dev
sleep 2
agent-dev search "ready"
```

### Portless with named sessions

```bash
agent-dev --session api --portless run npm run dev
# Server available at https://api.localhost
agent-dev --session api search "listening"
```

### Using env vars for defaults

```bash
export AGENT_DEV_SESSION=myapp
export AGENT_DEV_PORTLESS=1
agent-dev run npm run dev
```

### Restart after code changes

```bash
agent-dev restart
sleep 2
agent-dev status
```

## Notes

- Named sessions allow targeting specific servers with `--session`
- Without `--session`, commands target the first active session found
- Logs are captured to `~/.agent-dev/sessions/<id>/out.log`
- The process runs fully detached — it survives the parent shell exiting
- `restart` re-uses the original command, working directory, session name, and portless setting
- `stop` sends SIGTERM first, then SIGKILL after 500ms if needed
