/**
 * SSE context — connects to /api/events, maintains live session state,
 * distributes updates to all consumers.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SessionState, ToolEvent } from "./types";

interface SSEState {
	sessions: Map<number, SessionState>;
	toolFeed: ToolEvent[];
}

interface SSEContextValue {
	sessions: SessionState[];
	toolFeedForPid: (pid: number) => ToolEvent[];
}

const SSEContext = createContext<SSEContextValue>({
	sessions: [],
	toolFeedForPid: () => [],
});

export function useSSE() {
	return useContext(SSEContext);
}

export function SSEProvider({ children }: { children: React.ReactNode }) {
	const stateRef = useRef<SSEState>({ sessions: new Map(), toolFeed: [] });
	const [sessions, setSessions] = useState<SessionState[]>([]);
	const toolFeeds = useRef(new Map<number, ToolEvent[]>());

	useEffect(() => {
		const es = new EventSource("/api/events");

		es.onmessage = (e) => {
			if (!e.data) return;
			const event = JSON.parse(e.data);

			switch (event.type) {
				case "init":
					stateRef.current.sessions = new Map(
						(event.sessions as SessionState[]).map((s) => [s.pid, s]),
					);
					break;
				case "session_update":
					stateRef.current.sessions.set(event.pid, event.session);
					break;
				case "session_remove":
					stateRef.current.sessions.delete(event.pid);
					toolFeeds.current.delete(event.pid);
					break;
				case "tool_start":
				case "tool_end": {
					const feed = toolFeeds.current.get(event.pid) ?? [];
					if (event.type === "tool_start") {
						feed.push(event.event);
					} else {
						const idx = feed.findIndex((t) => t.toolCallId === event.event.toolCallId);
						if (idx >= 0) feed[idx] = event.event;
						else feed.push(event.event);
					}
					if (feed.length > 100) feed.splice(0, feed.length - 100);
					toolFeeds.current.set(event.pid, feed);
					break;
				}
			}

			setSessions(Array.from(stateRef.current.sessions.values()));
		};

		es.onerror = () => {
			// EventSource auto-reconnects
		};

		return () => es.close();
	}, []);

	const toolFeedForPid = useCallback(
		(pid: number) => toolFeeds.current.get(pid) ?? [],
		[],
	);

	return (
		<SSEContext.Provider value={{ sessions, toolFeedForPid }}>
			{children}
		</SSEContext.Provider>
	);
}
