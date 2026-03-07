# Pi Dashboard

A localhost dashboard for full visibility into parallel agentic workflows. Repo-agnostic, real-time, information-dense but calm. Inspired by infrastructure monitoring dashboards — panel-based, metric-forward, with charts that give you temporal context at a glance.

## Design direction

Reference: Xorizon-style dark monitoring dashboard. Key takeaways:
- **Panel grid layout** — everything lives in bordered cards on a dark background. Cards are the primary organizational unit.
- **Big numbers + small charts** — each metric card has a headline number and a mini visualization beneath it (sparkline, bar chart, or status list)
- **Sidebar navigation** — persistent left sidebar for switching between views
- **Uppercase tiny labels** — section/card titles are 10-11px uppercase tracking-wide
- **Monochrome with minimal accent** — mostly white-on-dark, accent color used sparingly
- **Dense but breathable** — lots of information, but generous padding inside cards and consistent grid gaps

### Layout structure

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  Dashboard                                           │
│  π         ├──────────────────────────────────────────────────────┤
│            │                                                      │
│  Dashboard │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  Worktrees │  │ TOTAL COST  │ │ AGENTS      │ │ TOKENS      │   │
│            │  │ $42.18      │ │ 3 active    │ │ 1.2M in     │   │
│            │  │ ▁▃▅▇▆▄▃▅▇  │ │ 2 idle      │ │ 340k out    │   │
│            │  └─────────────┘ └─────────────┘ └─────────────┘   │
│            │                                                      │
│            │  ┌──────────────────────┐ ┌──────────────────────┐  │
│            │  │ OPEN PRs             │ │ TOOL CALLS      24H  │  │
│            │  │ #13068 fix: ssl...  ✓│ │ ▁▃▅▇▆▄▃▅▇▆▄▃▅▇▆▄   │  │
│            │  │ #13063 fix: abort  ● │ │ bash: 342  edit: 128 │  │
│            │  │ #12834 feat: ci    ● │ │ read: 89   write: 45 │  │
│            │  └──────────────────────┘ └──────────────────────┘  │
│            │                                                      │
│            │  ┌──────────────────────────────────────────────┐   │
│            │  │ WORKTREES                                     │   │
│            │  │ feature/coworker-bash   3 changed  ● 1 agent │   │
│            │  │ feature/coworker/chan   2 changed             │   │
│            │  │ fix/abort-error-class   clean      ↑2 ahead  │   │
│            │  │ main                    clean                 │   │
│            │  │ release                 clean                 │   │
│            │  │ staging                 clean                 │   │
│            │  └──────────────────────────────────────────────┘   │
│            │                                                      │
│  Help      │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

### Worktree detail layout

```
┌────────────┬─────────────────────────────────┬────────────────────┐
│            │ feature/coworker-bash-constraints│ Agent 1 (opus)  ▼  │
│  π         │ ~/dev/escher/feature/...         │                    │
│            │ ↑2 ahead · 3 changed            │ TOOL CALLS         │
│  Dashboard ├─────────────────────────────────┤                    │
│  Worktrees │                                  │ 16:04:32 bash   ✓ │
│    feature/│ ┌────────────┐ ┌──────────────┐ │ 16:04:35 edit   ✓ │
│    feature/│ │ AGENT       │ │ PR #13068    │ │ 16:04:36 bash   ✓ │
│    fix/... │ │ ● opus-4-6  │ │ ✓ approved   │ │ 16:04:38 read   ✓ │
│    main    │ │ streaming   │ │ +1 -1        │ │ 16:04:39 bash   ● │
│    release │ │ $3.74 costs │ │              │ │                    │
│    staging │ │ 22k tokens  │ │              │ │                    │
│            │ └────────────┘ └──────────────┘ │                    │
│            │                                  │                    │
│            │ CHANGED FILES                    │                    │
│            │ M  src/api/channels.ts           │                    │
│            │ M  src/api/channels.test.ts      │                    │
│            │ A  src/api/channel-access.ts     │                    │
│            │                                  │                    │
│            │ RECENT COMMITS                   │                    │
│            │ a1b2c3d  fix: persist ...  4h    │                    │
│            │ d4e5f6g  feat: add ch...   1d    │                    │
│            │                                  │                    │
└────────────┴─────────────────────────────────┴────────────────────┘
```

## Pages

### Overview (`/`)

The page you keep open all day. Sidebar + main content with a card grid.

**Sidebar (persistent, all pages)**
- π logo/title at top
- Navigation links: Dashboard, then a list of worktrees (auto-populated from discovered repos)
- Worktrees in sidebar show branch name + a colored dot if an agent is active
- Bottom: link to settings/config

**Top row — 3 metric cards**

Each card has: uppercase label, big number, and a mini chart or breakdown.

1. **Total Cost** — headline dollar amount (session lifetime). Sparkline bar chart showing cost accumulation over time (bucketed by 5-min intervals, last few hours).
2. **Agents** — headline: "N active / M idle". List of active sessions with model name + status dot. If none active, show "no active agents" with last session info.
3. **Tokens** — headline: total in + out. Could show a simple in/out ratio bar or a sparkline of token throughput over time.

**Middle row — 2 cards**

4. **Open PRs** — table/list of open PRs. Number, title (truncated), review badge, +/- delta. Rows link to GitHub. Keep it compact — no card-per-PR, just rows.
5. **Tool Calls** — aggregated across all sessions. Histogram/bar chart of tool calls over time (last few hours, 5-min buckets). Below the chart: breakdown by tool name (bash: 342, edit: 128, read: 89, etc.).

**Bottom — Worktrees card**

6. **Worktrees** — single large card. Table rows, each worktree as a row: branch name, path, dirty/clean status, ahead/behind, agent count badge. Click → worktree detail. Sorted: active agents first, dirty second, then alphabetical.

### Worktree detail (`/worktree/:path`)

Sidebar stays visible, selected worktree is highlighted. Main content is split:

**Left ~65% — worktree info**

Top: branch name, path, ahead/behind, dirty/clean status.

Then a mini card grid:
- **Agent card** (per active agent): model, status, cost, tokens, last prompt. Clicking selects it for the sidebar tool feed.
- **PR card** (if one exists): number, title, review status, +/- lines, link to GitHub.

Below that:
- **Changed files** — status + filepath rows
- **Recent commits** — hash, message, relative time

**Right sidebar ~35% — tool call live feed**

Tabs for each active agent. Selected tab streams tool calls in real-time. Each row: timestamp, tool name, args summary, duration, success/error indicator.

### Agent detail (`/agent/:pid`) — stretch goal

Not building this yet. If the worktree detail + sidebar isn't enough, revisit.

## Architecture

### Vite SPA + Hono API server

Single process. Hono serves both the API and the built Vite SPA. No SSR.

- `hono` + `@hono/node-server` — API
- `better-sqlite3` — persistent storage (time-series, tool events, session history)
- `@octokit/rest` — GitHub PRs
- `react` + `react-dom` + `react-router` — SPA
- `tailwindcss` + `@tailwindcss/vite` — styling
- `vite` — build/dev

### Storage: SQLite + in-memory hot cache

Two layers:

**In-memory store** — hot state for live dashboard. Current sessions, SSE fanout, real-time tool call feed. This is the `store.ts` that exists today. Ephemeral — rebuilt from heartbeats on restart.

**SQLite** (`~/.pi/dashboard/dashboard.db`) — persistent storage for anything you'd want after a restart. Powered by `better-sqlite3` (synchronous, single-file, zero config).

Tables:

```sql
-- Time-series buckets for sparklines/histograms
CREATE TABLE timeseries (
  bucket_start INTEGER NOT NULL,  -- unix ms, rounded to 5-min
  cost         REAL DEFAULT 0,
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  tool_calls   INTEGER DEFAULT 0,
  PRIMARY KEY (bucket_start)
);

-- Tool call breakdown per bucket
CREATE TABLE tool_counts (
  bucket_start INTEGER NOT NULL,
  tool_name    TEXT NOT NULL,
  count        INTEGER DEFAULT 0,
  PRIMARY KEY (bucket_start, tool_name)
);

-- Individual tool call events (for per-session history)
CREATE TABLE tool_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pid          INTEGER NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  args_summary TEXT,
  timestamp    TEXT NOT NULL,
  duration_ms  INTEGER,
  is_error     INTEGER DEFAULT 0,
  cwd          TEXT
);

-- Session snapshots (written on heartbeat, kept after shutdown for history)
CREATE TABLE sessions (
  pid          INTEGER PRIMARY KEY,
  cwd          TEXT NOT NULL,
  model        TEXT,
  status       TEXT NOT NULL,
  cost         REAL DEFAULT 0,
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  last_prompt  TEXT,
  started_at   TEXT NOT NULL,
  last_seen    INTEGER NOT NULL,  -- unix ms
  ended_at     INTEGER            -- null if still alive
);
```

On ingest:
- **heartbeat** → upsert `sessions` row + update current `timeseries` bucket (cost/tokens delta since last heartbeat)
- **tool_start/tool_end** → insert into `tool_events`, increment `timeseries.tool_calls` and `tool_counts`
- **shutdown** → set `sessions.ended_at`

On query:
- Time-series endpoints read directly from SQLite (`SELECT * FROM timeseries WHERE bucket_start > ? ORDER BY bucket_start`)
- Tool breakdown: `SELECT tool_name, SUM(count) FROM tool_counts WHERE bucket_start > ? GROUP BY tool_name ORDER BY SUM(count) DESC`
- Session history: `SELECT * FROM sessions ORDER BY last_seen DESC`

Retention: cron-style cleanup on server start — delete timeseries/tool_events older than 7 days. Sessions older than 30 days.

This means:
- Sparklines survive daemon restarts
- You can answer "how much did I spend today" without any session being active
- Tool call history per session is queryable even after the session ends
- The in-memory store remains the source of truth for *live* state (what's streaming right now, SSE fanout)

### Multi-repo support

Repos are discovered automatically from active pi session cwds (resolve git root, enumerate worktrees). Additional repos can be configured in `~/.pi/dashboard/config.json`.

### Data transport: push over HTTP

Pi extension POSTs events to `POST /api/ingest`. No files. Server holds all state in memory.

- **Heartbeat** (10s interval): full session state refresh
- **Tool events**: tool_start / tool_end with timing
- **Agent events**: agent_start / agent_end
- **Shutdown**: session removal
- If server isn't running, POSTs silently fail. Server picks up state on next heartbeat.

### Ingest protocol

```typescript
{ type: "heartbeat", pid, cwd, model, thinkingLevel, status, tokens, cost, sessionFile, startedAt, turnCount, compactionCount, mcpServers }
{ type: "agent_start", pid, prompt }
{ type: "agent_end", pid }
{ type: "tool_start", pid, toolCallId, toolName, argsSummary, timestamp }
{ type: "tool_end", pid, toolCallId, toolName, durationMs, isError, timestamp }
{ type: "error", pid, message, timestamp }
{ type: "shutdown", pid }
```

### GitHub: Octokit

`@octokit/rest` with token from `gh auth token`. Conditional requests via ETags. Cache 30s.

### Caching

| Data source | Cache TTL | Notes |
|---|---|---|
| Worktree list (per repo) | 30s | background refresh |
| Per-worktree git status | 5s | invalidate on agent event in that worktree |
| Per-worktree git log | 15s | background refresh |
| Ahead/behind | 30s | can be slow if no network — must not block |
| PR data (Octokit) | 30s | conditional request, 304 is cheap |
| Streamsh | no cache | socket query, ~20ms |
| Pi sessions | in-memory | pushed by extension, always fresh |
| Time-series | in-memory | updated on ingest, served directly |

All git commands: 3s timeout max. If hung, skip and show what we have.

### SSE

`GET /api/events` — global event stream. Pushes session updates, tool events, agent status changes. Browser auto-reconnects. Initial payload sends current state snapshot.

### Page loading

Shell renders instantly. Data fills progressively:
1. **Instant**: session state + time-series (in-memory)
2. **Fast** (<100ms): streamsh, cached worktree lists
3. **Async** (100-500ms): git status/log (parallel, cached)
4. **Lazy** (500ms+): Octokit PRs (cached, conditional)

## Design system

### Colors (dark, primary)

```
bg:      #111113     page background
bg2:     #19191c     card background
bg3:     #242428     input/hover background
border:  #303036     card borders
fg:      #ececec     primary text
fg2:     #999        secondary text
fg3:     #5a5a5a     tertiary/label text
accent:  #7a9ec2     links, selected nav, interactive highlights
green:   #4aaa6e     success, clean status, approved
yellow:  #d4a05a     warning, pending, streaming
red:     #d04060     error, deletions, changes requested
```

### Colors (light, via prefers-color-scheme)

```
bg:      #f7f7f7
bg2:     #ffffff
bg3:     #ebebeb
border:  #d0d0d0
fg:      #1a1a1a
fg2:     #505050
fg3:     #999
accent:  #3a6a96
green:   #2d8050
yellow:  #a06828
red:     #b83048
```

### Typography

- **Font**: Berkeley Mono / SF Mono / JetBrains Mono / Fira Code, monospace
- **Body**: 13px, line-height 1.5
- **Card titles**: 10px, uppercase, tracking 1.5px, fg3 color
- **Metric headlines**: 24px, font-weight 600, fg color
- **Metric units**: 13px, fg2 color, inline after headline
- **Table rows**: 12-13px

### Cards

- Background: bg2
- Border: 1px solid border
- Border-radius: 6px
- Padding: 16px 20px
- No shadows, no gradients

### Charts

Rendered as inline SVG. No charting library — just `<rect>` bars and `<polyline>` sparklines. Keep it simple.

- **Sparkline**: 60px tall, width fills card. Stroke: fg3. No axes.
- **Bar chart**: bars are fg or white, background bars (yesterday/baseline) are bg3. X-axis labels at bottom in fg3.
- **Tool breakdown**: horizontal bars, label left, count right.

### Sidebar

- Width: 200px fixed
- Background: bg2 (same as cards, distinct from page bg)
- Border-right: 1px solid border
- Nav items: 13px, fg2 color, padding 8px 16px, hover: bg3 background
- Active item: fg color, accent left border (2px)
- Worktree list: indented slightly under "Worktrees" label, 12px

### Animations

- Status dots: pulse (1.5s ease-in-out infinite, opacity 1→0.4→1)
- Nothing else animates. No transitions on page changes. Data appears or doesn't.

## Implementation order

1. **SQLite setup** — schema, migrations, db.ts module with typed helpers
2. **Wire ingest → SQLite** — update store.ts to write to SQLite on each event (timeseries buckets, tool events, session snapshots)
3. **API endpoints** — `/api/timeseries`, `/api/tool-breakdown`, `/api/session-history`
4. **Redesign overview page** — sidebar + card grid with metric cards, PR card, tool card, worktree card
5. **SVG chart components** — sparkline, bar chart, horizontal bar breakdown
6. **Redesign worktree detail** — sidebar stays visible, card grid for agent/PR, tool feed sidebar
7. **Polish** — responsive, edge cases, light theme tuning, retention cleanup

## Open questions

- Should the sidebar worktree list be collapsible per-repo, or flat?
- Do we want a "settings" page in the sidebar (configure repos, theme, etc.) or is the config file enough?
