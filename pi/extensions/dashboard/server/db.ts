/**
 * SQLite persistence layer.
 * Stores time-series buckets, tool events, and session snapshots.
 */

import Database from "better-sqlite3";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_DIR = path.join(os.homedir(), ".pi", "dashboard");
const DB_PATH = path.join(DB_DIR, "dashboard.db");
const BUCKET_SIZE_MS = 5 * 60 * 1000; // 5 minutes

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS timeseries (
    bucket_start INTEGER NOT NULL PRIMARY KEY,
    cost         REAL DEFAULT 0,
    tokens_in    INTEGER DEFAULT 0,
    tokens_out   INTEGER DEFAULT 0,
    tool_calls   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tool_counts (
    bucket_start INTEGER NOT NULL,
    tool_name    TEXT NOT NULL,
    count        INTEGER DEFAULT 0,
    PRIMARY KEY (bucket_start, tool_name)
  );

  CREATE TABLE IF NOT EXISTS tool_events (
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

  CREATE TABLE IF NOT EXISTS sessions (
    pid          INTEGER PRIMARY KEY,
    cwd          TEXT NOT NULL,
    model        TEXT,
    status       TEXT NOT NULL DEFAULT 'idle',
    cost         REAL DEFAULT 0,
    tokens_in    INTEGER DEFAULT 0,
    tokens_out   INTEGER DEFAULT 0,
    last_prompt  TEXT,
    started_at   TEXT NOT NULL,
    last_seen    INTEGER NOT NULL,
    ended_at     INTEGER
  );
`);

// ── Prepared statements ─────────────────────────────────────────────────────

const stmts = {
	upsertTimeseries: db.prepare(`
    INSERT INTO timeseries (bucket_start, cost, tokens_in, tokens_out, tool_calls)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bucket_start) DO UPDATE SET
      cost = cost + excluded.cost,
      tokens_in = tokens_in + excluded.tokens_in,
      tokens_out = tokens_out + excluded.tokens_out,
      tool_calls = tool_calls + excluded.tool_calls
  `),

	upsertToolCount: db.prepare(`
    INSERT INTO tool_counts (bucket_start, tool_name, count)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_start, tool_name) DO UPDATE SET
      count = count + 1
  `),

	insertToolEvent: db.prepare(`
    INSERT INTO tool_events (pid, tool_call_id, tool_name, args_summary, timestamp, duration_ms, is_error, cwd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

	upsertSession: db.prepare(`
    INSERT INTO sessions (pid, cwd, model, status, cost, tokens_in, tokens_out, last_prompt, started_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pid) DO UPDATE SET
      cwd = excluded.cwd,
      model = excluded.model,
      status = excluded.status,
      cost = excluded.cost,
      tokens_in = excluded.tokens_in,
      tokens_out = excluded.tokens_out,
      last_prompt = COALESCE(excluded.last_prompt, last_prompt),
      last_seen = excluded.last_seen
  `),

	endSession: db.prepare(`
    UPDATE sessions SET ended_at = ?, status = 'ended' WHERE pid = ?
  `),

	getTimeseries: db.prepare(`
    SELECT * FROM timeseries WHERE bucket_start > ? ORDER BY bucket_start
  `),

	getToolBreakdown: db.prepare(`
    SELECT tool_name, SUM(count) as total FROM tool_counts
    WHERE bucket_start > ? GROUP BY tool_name ORDER BY total DESC
  `),

	getToolEventsForPid: db.prepare(`
    SELECT * FROM tool_events WHERE pid = ? ORDER BY id DESC LIMIT 100
  `),

	getRecentSessions: db.prepare(`
    SELECT * FROM sessions ORDER BY last_seen DESC LIMIT 50
  `),

	cleanup: {
		timeseries: db.prepare(`DELETE FROM timeseries WHERE bucket_start < ?`),
		toolCounts: db.prepare(`DELETE FROM tool_counts WHERE bucket_start < ?`),
		toolEvents: db.prepare(`DELETE FROM tool_events WHERE timestamp < ?`),
		sessions: db.prepare(`DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?`),
	},
};

// ── Public API ──────────────────────────────────────────────────────────────

function currentBucket(): number {
	return Math.floor(Date.now() / BUCKET_SIZE_MS) * BUCKET_SIZE_MS;
}

// Track last-seen cost/tokens per PID to compute deltas
const lastSeen = new Map<number, { cost: number; tokensIn: number; tokensOut: number }>();

export function recordHeartbeat(data: {
	pid: number;
	cwd: string;
	model: string | null;
	status: string;
	cost: number;
	tokens: { input: number; output: number };
	lastPrompt: string | null;
	startedAt: string;
}) {
	const bucket = currentBucket();
	const prev = lastSeen.get(data.pid) ?? { cost: 0, tokensIn: 0, tokensOut: 0 };

	const costDelta = Math.max(0, data.cost - prev.cost);
	const tokensInDelta = Math.max(0, data.tokens.input - prev.tokensIn);
	const tokensOutDelta = Math.max(0, data.tokens.output - prev.tokensOut);

	if (costDelta > 0 || tokensInDelta > 0 || tokensOutDelta > 0) {
		stmts.upsertTimeseries.run(bucket, costDelta, tokensInDelta, tokensOutDelta, 0);
	}

	lastSeen.set(data.pid, { cost: data.cost, tokensIn: data.tokens.input, tokensOut: data.tokens.output });

	stmts.upsertSession.run(
		data.pid, data.cwd, data.model, data.status, data.cost,
		data.tokens.input, data.tokens.output, data.lastPrompt,
		data.startedAt, Date.now(),
	);
}

export function recordToolEnd(data: {
	pid: number;
	toolCallId: string;
	toolName: string;
	argsSummary: string;
	timestamp: string;
	durationMs: number;
	isError: boolean;
	cwd?: string;
}) {
	const bucket = currentBucket();
	stmts.upsertTimeseries.run(bucket, 0, 0, 0, 1);
	stmts.upsertToolCount.run(bucket, data.toolName);
	stmts.insertToolEvent.run(
		data.pid, data.toolCallId, data.toolName, data.argsSummary,
		data.timestamp, data.durationMs, data.isError ? 1 : 0, data.cwd ?? null,
	);
}

export function recordSessionEnd(pid: number) {
	stmts.endSession.run(Date.now(), pid);
	lastSeen.delete(pid);
}

export interface TimeseriesBucket {
	bucket_start: number;
	cost: number;
	tokens_in: number;
	tokens_out: number;
	tool_calls: number;
}

export interface ToolBreakdown {
	tool_name: string;
	total: number;
}

export function getTimeseries(sinceMs: number): TimeseriesBucket[] {
	return stmts.getTimeseries.all(sinceMs) as TimeseriesBucket[];
}

export function getToolBreakdown(sinceMs: number): ToolBreakdown[] {
	return stmts.getToolBreakdown.all(sinceMs) as ToolBreakdown[];
}

export function getToolEventsForPid(pid: number) {
	return stmts.getToolEventsForPid.all(pid);
}

export function getRecentSessions() {
	return stmts.getRecentSessions.all();
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function runCleanup() {
	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
	const sevenDaysAgoISO = new Date(sevenDaysAgo).toISOString();

	stmts.cleanup.timeseries.run(sevenDaysAgo);
	stmts.cleanup.toolCounts.run(sevenDaysAgo);
	stmts.cleanup.toolEvents.run(sevenDaysAgoISO);
	stmts.cleanup.sessions.run(thirtyDaysAgo);
}

// run cleanup on startup
runCleanup();

export { db };
