import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import * as path from "node:path";

import { getTimeseries, getToolBreakdown, getRecentSessions, getToolEventsForPid, getAggregatedCost } from "./db.js";
import { getWorktreeDetail } from "./git.js";
import { getMyPRs, getRepoFullName, getBranchPRStatus } from "./github.js";
import { discoverRepos, sessionWorktree } from "./repos.js";
import { store, type SSEEvent } from "./store.js";

const app = new Hono();

app.use("*", cors());

// ── Ingest endpoint (pi extensions POST here) ──────────────────────────────

app.post("/api/ingest", async (c) => {
	const body = await c.req.json();

	switch (body.type) {
		case "heartbeat":
			store.heartbeat(body);
			break;
		case "agent_start":
			store.agentStart(body.pid, body.prompt);
			break;
		case "agent_end":
			store.agentEnd(body.pid);
			break;
		case "tool_start":
			store.toolStart(body.pid, body.toolCallId, body.toolName, body.argsSummary, body.timestamp);
			break;
		case "tool_end":
			store.toolEnd(body.pid, body.toolCallId, body.toolName, body.durationMs, body.isError, body.timestamp);
			break;
		case "error":
			store.error(body.pid, body.message, body.timestamp);
			break;
		case "shutdown":
			store.shutdown(body.pid);
			break;
	}

	return c.text("ok");
});

// ── SSE stream ──────────────────────────────────────────────────────────────

app.get("/api/events", (c) => {
	return streamSSE(c, async (stream) => {
		// send current state as initial payload
		const sessions = store.getAllSessions();
		await stream.writeSSE({ data: JSON.stringify({ type: "init", sessions }), event: "message" });

		const unsub = store.subscribe(async (event: SSEEvent) => {
			try {
				await stream.writeSSE({ data: JSON.stringify(event), event: "message" });
			} catch {
				// stream closed
			}
		});

		// keep alive
		const keepAlive = setInterval(async () => {
			try {
				await stream.writeSSE({ data: "", event: "ping" });
			} catch {
				clearInterval(keepAlive);
			}
		}, 15_000);

		stream.onAbort(() => {
			unsub();
			clearInterval(keepAlive);
		});

		// block until client disconnects
		await new Promise(() => {});
	});
});

// ── API routes ──────────────────────────────────────────────────────────────

app.get("/api/overview", async (c) => {
	const repos = await discoverRepos();
	const sessions = store.getAllSessions();

	// aggregate metrics
	let totalCost = 0;
	let totalInput = 0;
	let totalOutput = 0;
	let activeCount = 0;
	let idleCount = 0;

	for (const s of sessions) {
		totalCost += s.cost;
		totalInput += s.tokens.input;
		totalOutput += s.tokens.output;
		if (s.status === "idle") idleCount++;
		else activeCount++;
	}

	// fetch all open PRs for cross-referencing
	const seenRepos = new Set<string>();
	const allOpenPRs: Awaited<ReturnType<typeof getMyPRs>> = [];
	for (const repo of repos) {
		const fullName = await getRepoFullName(repo.root);
		if (fullName && !seenRepos.has(fullName)) {
			seenRepos.add(fullName);
			const prs = await getMyPRs(fullName);
			allOpenPRs.push(...prs);
		}
	}

	// build worktree list with matched sessions, dedup by path
	const seenPaths = new Set<string>();
	const SKIP_BRANCHES = new Set(["main", "master", "release", "staging", "develop"]);
	const worktrees = [];
	for (const repo of repos) {
		const repoFullName = await getRepoFullName(repo.root);
		for (const wt of repo.worktrees) {
			if (seenPaths.has(wt.path)) continue;
			seenPaths.add(wt.path);
			const agents = sessions.filter((s) => s.cwd.startsWith(wt.path));

			// match open PR by branch name
			const openPR = wt.branch ? allOpenPRs.find((p) => p.branch === wt.branch) ?? null : null;

			let stale: { state: string; number: number; url: string } | null = null;
			if (!openPR && repoFullName && wt.branch && !SKIP_BRANCHES.has(wt.branch)) {
				const prStatus = await getBranchPRStatus(repoFullName, wt.branch);
				if (prStatus && (prStatus.merged || prStatus.state === "CLOSED")) {
					stale = { state: prStatus.state, number: prStatus.number, url: prStatus.url };
				}
			}

			worktrees.push({
				...wt,
				repoRoot: repo.root,
				agents,
				agentCount: agents.length,
				anyActive: agents.some((a) => a.status !== "idle"),
				stale,
				pr: openPR ? { number: openPR.number, reviewDecision: openPR.reviewDecision, url: openPR.url } : null,
			});
		}
	}

	// sort: active agents first, stale last, then alphabetical
	worktrees.sort((a, b) => {
		if (a.agentCount !== b.agentCount) return b.agentCount - a.agentCount;
		if (!!a.stale !== !!b.stale) return a.stale ? 1 : -1;
		return (a.branch ?? "").localeCompare(b.branch ?? "");
	});

	return c.json({
		metrics: { totalCost, totalInput, totalOutput, activeCount, idleCount, sessionCount: sessions.length },
		worktrees,
		unmatchedSessions: sessions.filter((s) => !repos.some((r) => r.sessions.includes(s))),
	});
});

app.get("/api/worktree", async (c) => {
	const wtPath = c.req.query("path");
	if (!wtPath) return c.json({ error: "path required" }, 400);

	const detail = await getWorktreeDetail(wtPath);
	const sessions = store.getAllSessions().filter((s) => s.cwd.startsWith(wtPath));

	// find PR for this branch
	let pr = null;
	if (detail.branch) {
		const repos = await discoverRepos();
		for (const repo of repos) {
			if (wtPath.startsWith(repo.root)) {
				const fullName = await getRepoFullName(repo.root);
				if (fullName) {
					const prs = await getMyPRs(fullName);
					pr = prs.find((p) => p.branch === detail.branch) ?? null;
				}
				break;
			}
		}
	}

	return c.json({ ...detail, agents: sessions, pr });
});

app.get("/api/prs", async (c) => {
	const repos = await discoverRepos();
	const seen = new Set<string>();
	const allPrs = [];

	for (const repo of repos) {
		const fullName = await getRepoFullName(repo.root);
		if (fullName && !seen.has(fullName)) {
			seen.add(fullName);
			const prs = await getMyPRs(fullName);
			allPrs.push(...prs);
		}
	}

	return c.json(allPrs);
});

app.get("/api/cost", (c) => {
	const range = c.req.query("range") ?? "today";
	const now = Date.now();
	let since: number;
	switch (range) {
		case "today": {
			const d = new Date(); d.setHours(0, 0, 0, 0);
			since = d.getTime();
			break;
		}
		case "wtd": {
			const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0);
			since = d.getTime();
			break;
		}
		case "mtd": {
			const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
			since = d.getTime();
			break;
		}
		default: since = 0;
	}
	return c.json(getAggregatedCost(since));
});

app.get("/api/timeseries", (c) => {
	const hours = parseInt(c.req.query("hours") ?? "24", 10);
	const since = Date.now() - hours * 60 * 60 * 1000;
	return c.json(getTimeseries(since));
});

app.get("/api/tool-breakdown", (c) => {
	const hours = parseInt(c.req.query("hours") ?? "24", 10);
	const since = Date.now() - hours * 60 * 60 * 1000;
	return c.json(getToolBreakdown(since));
});

app.get("/api/session-history", (c) => {
	return c.json(getRecentSessions());
});

app.get("/api/tool-events/:pid", (c) => {
	const pid = parseInt(c.req.param("pid"), 10);
	return c.json(getToolEventsForPid(pid));
});

app.post("/api/worktree/remove", async (c) => {
	const { path: wtPath } = await c.req.json();
	if (!wtPath) return c.json({ error: "path required" }, 400);

	try {
		const { exec: execCb } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const fs = await import("node:fs");
		const pathMod = await import("node:path");
		const run = promisify(execCb);

		// find the bare repo dir
		let bareDir: string;
		if (fs.existsSync(wtPath)) {
			const { stdout } = await run(`git -C "${wtPath}" rev-parse --git-common-dir`, { timeout: 5_000 });
			bareDir = stdout.trim();
		} else {
			let dir = wtPath;
			while (dir !== "/") {
				dir = pathMod.dirname(dir);
				const candidate = pathMod.join(dir, ".bare");
				if (fs.existsSync(candidate)) { bareDir = candidate; break; }
			}
			bareDir ??= wtPath;
		}

		// prune stale worktrees
		await run(`git -C "${bareDir}" worktree prune`, { timeout: 5_000 }).catch(() => {});

		// remove if directory still exists on disk
		if (fs.existsSync(wtPath)) {
			await run(`git -C "${bareDir}" worktree remove "${wtPath}" --force`, { timeout: 60_000 });
		}

		return c.json({ ok: true });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return c.json({ error: msg }, 500);
	}
});

app.get("/api/health", (c) => c.json({ ok: true }));

// ── Static files ────────────────────────────────────────────────────────────

const clientDir = path.resolve(import.meta.dirname ?? ".", "../dist/client");

app.get("*", async (c, next) => {
	// try API routes first
	if (c.req.path.startsWith("/api")) return next();

	const fs = await import("node:fs");
	const filePath = path.join(clientDir, c.req.path === "/" ? "index.html" : c.req.path);

	if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
		const ext = path.extname(filePath);
		const mimeTypes: Record<string, string> = {
			".html": "text/html",
			".js": "application/javascript",
			".css": "text/css",
			".json": "application/json",
			".png": "image/png",
			".svg": "image/svg+xml",
			".ico": "image/x-icon",
		};
		const content = fs.readFileSync(filePath);
		return new Response(content, {
			headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" },
		});
	}

	// SPA fallback — serve index.html for client-side routing
	const indexPath = path.join(clientDir, "index.html");
	if (fs.existsSync(indexPath)) {
		const content = fs.readFileSync(indexPath);
		return new Response(content, { headers: { "Content-Type": "text/html" } });
	}

	return next();
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.DASHBOARD_PORT ?? process.env.PORT ?? "7778", 10);

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, () => {
	console.log(`pi dashboard server running at http://127.0.0.1:${PORT}`);
});
