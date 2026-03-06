/**
 * Production Read-Only Database Extension
 *
 * Provides a `query_prd_db` tool that lets agents run SELECT queries against
 * the production read replica. Connection string is pulled from Doppler
 * (read-only-db-replica / prd) at startup.
 *
 * Safety:
 * - Only SELECT / WITH ... SELECT / EXPLAIN queries are allowed
 * - LIMIT 100 is appended if no LIMIT is present
 * - Query timeout is 15 seconds
 * - Uses the read replica, not the primary
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import pg from "pg";

const QUERY_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 100;

const ALLOWED_PREFIXES = ["select", "with", "explain"];

function isReadOnly(sql: string): boolean {
	const trimmed = sql.trim().toLowerCase();
	return ALLOWED_PREFIXES.some((p) => trimmed.startsWith(p));
}

function ensureLimit(sql: string): string {
	const lower = sql.trim().toLowerCase();
	if (lower.includes("limit")) return sql;
	return `${sql.trimEnd()}\nLIMIT ${DEFAULT_LIMIT}`;
}

let pool: pg.Pool | null = null;

async function getPool(): Promise<pg.Pool> {
	if (pool) return pool;

	const { execSync } = await import("node:child_process");
	const url = execSync(
		"doppler secrets get DATABASE_URL --plain --project read-only-db-replica --config prd",
		{
			encoding: "utf-8",
			timeout: 10_000,
		},
	).trim();

	pool = new pg.Pool({
		connectionString: url,
		ssl: { rejectUnauthorized: false },
		max: 2,
		idleTimeoutMillis: 60_000,
		statement_timeout: QUERY_TIMEOUT_MS,
	});

	return pool;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "query_prd_db",
		label: "Query PRD DB",
		description:
			"Run a read-only SQL query against the production database (read replica). Only SELECT queries are allowed. Results are limited to 100 rows by default. Use this to inspect production data, debug issues, or answer questions about the state of the system.",
		parameters: Type.Object({
			query: Type.String({ description: "SQL SELECT query to execute" }),
		}),

		async execute(_toolCallId, params) {
			const sql = params.query.trim();

			if (!isReadOnly(sql)) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: Only SELECT / WITH / EXPLAIN queries are allowed.",
						},
					],
					details: { error: true },
				};
			}

			const finalSql = ensureLimit(sql);

			try {
				const p = await getPool();
				const result = await p.query(finalSql);

				const rowCount = result.rows.length;
				const fields = result.fields.map((f) => f.name);

				let output: string;
				if (rowCount === 0) {
					output = `Query returned 0 rows.\nColumns: ${fields.join(", ")}`;
				} else {
					output = `${rowCount} row(s) returned.\n\n${JSON.stringify(result.rows, null, 2)}`;
				}

				return {
					content: [{ type: "text" as const, text: output }],
					details: { rowCount, fields },
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : JSON.stringify(err);
				return {
					content: [{ type: "text" as const, text: `Query error: ${message}` }],
					details: { error: true },
				};
			}
		},
	});
}
