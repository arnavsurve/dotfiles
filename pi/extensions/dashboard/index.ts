/**
 * Dashboard Extension — pushes pi session events to the dashboard server via HTTP.
 *
 * Events are fire-and-forget. If the server isn't running, POSTs silently fail.
 * The server holds all state in memory.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { exec, spawn } from "node:child_process";
import * as http from "node:http";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const SERVER_ENTRY = path.join(import.meta.dirname ?? __dirname, "server", "main.ts");
const PORT = 7778;
const INGEST_URL = `http://127.0.0.1:${PORT}/api/ingest`;
const HEARTBEAT_INTERVAL = 10_000;

function post(data: Record<string, unknown>): void {
	const body = JSON.stringify(data);
	const req = http.request(INGEST_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
		timeout: 2000,
	});
	req.on("error", () => {});
	req.end(body);
}

function isServerRunning(): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
			res.resume();
			resolve(res.statusCode === 200);
		});
		req.on("error", () => resolve(false));
		req.setTimeout(1000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function ensureServer(): Promise<void> {
	if (await isServerRunning()) return;

	const child = spawn("npx", ["tsx", SERVER_ENTRY], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, DASHBOARD_PORT: PORT.toString() },
	});
	child.unref();

	// wait for it to come up
	for (let i = 0; i < 20; i++) {
		await new Promise((r) => setTimeout(r, 250));
		if (await isServerRunning()) return;
	}
}

function computeStats(ctx: ExtensionContext): { input: number; output: number; cost: number } {
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const e of ctx.sessionManager.getEntries()) {
		if (e.type === "message" && e.message.role === "assistant") {
			const m = e.message as AssistantMessage;
			input += m.usage.input;
			output += m.usage.output;
			cost += m.usage.cost.total;
		}
	}
	return { input, output, cost };
}

function buildHeartbeat(ctx: ExtensionContext, status?: string): Record<string, unknown> {
	const model = ctx.model;
	const stats = computeStats(ctx);
	return {
		type: "heartbeat",
		pid: process.pid,
		cwd: cwdOverride ?? ctx.cwd,
		model: model ? `${model.provider}/${model.id}` : null,
		thinkingLevel: "medium",
		status: status ?? "idle",
		tokens: { input: stats.input, output: stats.output },
		cost: stats.cost,
		sessionFile: ctx.sessionManager.getSessionFile() ?? null,
		startedAt: new Date().toISOString(),
		turnCount: 0,
		compactionCount: 0,
		mcpServers: [],
	};
}

function summarizeArgs(input: Record<string, unknown>): string {
	if (input.command) return String(input.command).slice(0, 100);
	if (input.path) return String(input.path).slice(0, 100);
	if (input.query) return String(input.query).slice(0, 100);
	const keys = Object.keys(input);
	return keys.slice(0, 3).join(", ");
}

async function detectWorktree(input: string): Promise<string> {
	const os = await import("node:os");
	const expanded = input.replace(/^~/, os.homedir());
	try {
		const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd: expanded });
		return stdout.trim();
	} catch {
		return expanded;
	}
}

// track tool start times for duration calculation
const toolStartTimes = new Map<string, number>();
let cwdOverride: string | null = null;

export default function (pi: ExtensionAPI) {
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let lastCtx: ExtensionContext | null = null;

	pi.on("session_start", async (_event, ctx) => {
		lastCtx = ctx;
		await ensureServer();
		post(buildHeartbeat(ctx));

		heartbeatTimer = setInterval(() => {
			if (lastCtx) post(buildHeartbeat(lastCtx));
		}, HEARTBEAT_INTERVAL);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		lastCtx = ctx;
		const prompt = typeof event.prompt === "string" ? event.prompt : "[multimodal]";
		post({ type: "agent_start", pid: process.pid, prompt: prompt.slice(0, 300) });
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		lastCtx = ctx;
		const args = typeof event.args === "object" && event.args ? event.args : {};
		toolStartTimes.set(event.toolCallId, Date.now());
		post({
			type: "tool_start",
			pid: process.pid,
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			argsSummary: summarizeArgs(args as Record<string, unknown>),
			timestamp: new Date().toISOString(),
		});
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		lastCtx = ctx;
		const startTime = toolStartTimes.get(event.toolCallId);
		const durationMs = startTime ? Date.now() - startTime : 0;
		toolStartTimes.delete(event.toolCallId);
		post({
			type: "tool_end",
			pid: process.pid,
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			durationMs,
			isError: event.isError ?? false,
			timestamp: new Date().toISOString(),
		});
	});

	pi.on("agent_end", async (_event, ctx) => {
		lastCtx = ctx;
		post({ type: "agent_end", pid: process.pid });
		post(buildHeartbeat(ctx, "idle"));
	});

	pi.on("model_select", async (_event, ctx) => {
		lastCtx = ctx;
		post(buildHeartbeat(ctx));
	});

	pi.on("session_shutdown", async () => {
		if (heartbeatTimer) clearInterval(heartbeatTimer);
		post({ type: "shutdown", pid: process.pid });
	});

	pi.registerCommand("worktree", {
		description: "Switch dashboard identity to a worktree path (e.g. /worktree ~/dev/escher/feature/foo)",
		handler: async (args, ctx) => {
			const target = args.trim();
			if (!target) {
				ctx.ui.notify(cwdOverride ? `Currently tracking: ${cwdOverride}` : "No worktree override set. Pass a path.");
				return;
			}
			cwdOverride = await detectWorktree(target);
			post(buildHeartbeat(ctx));
			ctx.ui.notify(`Dashboard now tracking: ${cwdOverride}`);
		},
	});

	pi.registerCommand("dashboard", {
		description: "Open the dashboard in your browser",
		handler: async (_args, _ctx) => {
			await ensureServer();
			await execAsync(`open http://127.0.0.1:${PORT}`);
		},
	});
}
