/**
 * In-memory state store. Pi extensions push events here via HTTP.
 * SSE listeners get notified on every change.
 * Writes through to SQLite for persistence (time-series, tool events, sessions).
 */

import { recordHeartbeat, recordSessionEnd, recordToolEnd } from "./db.js";

export interface ToolEvent {
	toolCallId: string;
	toolName: string;
	argsSummary: string;
	timestamp: string;
	durationMs?: number;
	isError?: boolean;
	done: boolean;
}

export interface ErrorEvent {
	timestamp: string;
	message: string;
}

export interface SessionState {
	pid: number;
	cwd: string;
	gitRoot?: string;
	model: string | null;
	thinkingLevel: string;
	status: string;
	lastActivity: number;
	lastPrompt: string | null;
	currentTool: string | null;
	tokens: { input: number; output: number };
	cost: number;
	sessionFile: string | null;
	startedAt: string;
	turnCount: number;
	compactionCount: number;
	mcpServers: string[];
	toolHistory: ToolEvent[];
	errors: ErrorEvent[];
}

export type SSEEvent =
	| { type: "session_update"; pid: number; session: SessionState }
	| { type: "session_remove"; pid: number }
	| { type: "tool_start"; pid: number; event: ToolEvent }
	| { type: "tool_end"; pid: number; event: ToolEvent }
	| { type: "agent_start"; pid: number; prompt: string }
	| { type: "agent_end"; pid: number };

type SSEListener = (event: SSEEvent) => void;

const HEARTBEAT_TIMEOUT_MS = 30_000;
const TOOL_HISTORY_MAX = 50;
const ERROR_HISTORY_MAX = 10;

class Store {
	sessions = new Map<number, SessionState>();
	private listeners = new Set<SSEListener>();
	private pendingTools = new Map<string, { startTime: number; event: ToolEvent }>();

	subscribe(listener: SSEListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(event: SSEEvent) {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// don't let one bad listener break others
			}
		}
	}

	heartbeat(data: {
		pid: number;
		cwd: string;
		model: string | null;
		thinkingLevel: string;
		status: string;
		tokens: { input: number; output: number };
		cost: number;
		sessionFile: string | null;
		startedAt: string;
		turnCount: number;
		compactionCount: number;
		mcpServers: string[];
	}) {
		let session = this.sessions.get(data.pid);
		if (!session) {
			session = {
				...data,
				lastActivity: Date.now(),
				lastPrompt: null,
				currentTool: null,
				toolHistory: [],
				errors: [],
			};
			this.sessions.set(data.pid, session);
		} else {
			Object.assign(session, data);
			session.lastActivity = Date.now();
		}
		this.emit({ type: "session_update", pid: data.pid, session });

		recordHeartbeat({
			pid: data.pid,
			cwd: data.cwd,
			model: data.model,
			status: data.status,
			cost: data.cost,
			tokens: data.tokens,
			lastPrompt: session.lastPrompt,
			startedAt: data.startedAt,
		});
	}

	agentStart(pid: number, prompt: string) {
		const session = this.sessions.get(pid);
		if (!session) return;
		session.status = "streaming";
		session.lastPrompt = prompt.slice(0, 300);
		session.lastActivity = Date.now();
		this.emit({ type: "agent_start", pid, prompt: session.lastPrompt });
		this.emit({ type: "session_update", pid, session });
	}

	agentEnd(pid: number) {
		const session = this.sessions.get(pid);
		if (!session) return;
		session.status = "idle";
		session.currentTool = null;
		session.lastActivity = Date.now();
		this.emit({ type: "agent_end", pid });
		this.emit({ type: "session_update", pid, session });
	}

	toolStart(pid: number, toolCallId: string, toolName: string, argsSummary: string, timestamp: string) {
		const session = this.sessions.get(pid);
		if (!session) return;
		session.status = `tool:${toolName}`;
		session.currentTool = toolName;
		session.lastActivity = Date.now();

		const event: ToolEvent = { toolCallId, toolName, argsSummary, timestamp, done: false };
		this.pendingTools.set(toolCallId, { startTime: Date.now(), event });

		this.emit({ type: "tool_start", pid, event });
		this.emit({ type: "session_update", pid, session });
	}

	toolEnd(pid: number, toolCallId: string, toolName: string, durationMs: number, isError: boolean, timestamp: string) {
		const session = this.sessions.get(pid);
		if (!session) return;
		session.status = "streaming";
		session.currentTool = null;
		session.lastActivity = Date.now();

		const pending = this.pendingTools.get(toolCallId);
		const event: ToolEvent = pending
			? { ...pending.event, durationMs, isError, done: true, timestamp }
			: { toolCallId, toolName, argsSummary: "", timestamp, durationMs, isError, done: true };

		this.pendingTools.delete(toolCallId);

		session.toolHistory.push(event);
		if (session.toolHistory.length > TOOL_HISTORY_MAX) {
			session.toolHistory = session.toolHistory.slice(-TOOL_HISTORY_MAX);
		}

		this.emit({ type: "tool_end", pid, event });
		this.emit({ type: "session_update", pid, session });

		recordToolEnd({
			pid,
			toolCallId,
			toolName,
			argsSummary: event.argsSummary,
			timestamp,
			durationMs,
			isError,
			cwd: session.cwd,
		});
	}

	error(pid: number, message: string, timestamp: string) {
		const session = this.sessions.get(pid);
		if (!session) return;
		session.errors.push({ timestamp, message });
		if (session.errors.length > ERROR_HISTORY_MAX) {
			session.errors = session.errors.slice(-ERROR_HISTORY_MAX);
		}
		session.lastActivity = Date.now();
		this.emit({ type: "session_update", pid, session });
	}

	shutdown(pid: number) {
		this.sessions.delete(pid);
		this.pendingTools.clear();
		this.emit({ type: "session_remove", pid });
		recordSessionEnd(pid);
	}

	reapDead() {
		const now = Date.now();
		for (const [pid, session] of this.sessions) {
			if (now - session.lastActivity > HEARTBEAT_TIMEOUT_MS) {
				this.sessions.delete(pid);
				this.emit({ type: "session_remove", pid });
				recordSessionEnd(pid);
			}
		}
	}

	getAllSessions(): SessionState[] {
		return Array.from(this.sessions.values());
	}
}

export const store = new Store();

// reap dead sessions every 15s
setInterval(() => store.reapDead(), 15_000);
