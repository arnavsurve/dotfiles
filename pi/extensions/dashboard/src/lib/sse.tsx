/**
 * SSE context — connects to /api/events, maintains live session state,
 * distributes updates to all consumers.
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { SessionState, ToolEvent } from "./types";

interface SSEContextValue {
	sessions: SessionState[];
	toolFeedForPid: (pid: number) => ToolEvent[];
	toolFeedVersion: number;
}

const SSEContext = createContext<SSEContextValue>({
	sessions: [],
	toolFeedForPid: () => [],
	toolFeedVersion: 0,
});

export function useSSE() {
	return useContext(SSEContext);
}

export function SSEProvider({ children }: { children: React.ReactNode }) {
	const sessionsRef = useRef(new Map<number, SessionState>());
	const toolFeeds = useRef(new Map<number, ToolEvent[]>());
	const [sessions, setSessions] = useState<SessionState[]>([]);
	const [toolFeedVersion, setToolFeedVersion] = useState(0);

	useEffect(() => {
		const es = new EventSource("/api/events");

		es.onmessage = (e) => {
			if (!e.data) return;
			const event = JSON.parse(e.data);

			switch (event.type) {
				case "init":
					sessionsRef.current = new Map(
						(event.sessions as SessionState[]).map((s: SessionState) => [s.pid, s]),
					);
					setSessions(Array.from(sessionsRef.current.values()));
					break;

				case "session_update":
					sessionsRef.current.set(event.pid, event.session);
					setSessions(Array.from(sessionsRef.current.values()));
					break;

				case "session_remove":
					sessionsRef.current.delete(event.pid);
					toolFeeds.current.delete(event.pid);
					setSessions(Array.from(sessionsRef.current.values()));
					break;

				case "tool_start":
				case "tool_end": {
					const feed = toolFeeds.current.get(event.pid) ?? [];
					if (event.type === "tool_start") {
						feed.push(event.event);
					} else {
						const idx = feed.findIndex((t: ToolEvent) => t.toolCallId === event.event.toolCallId);
						if (idx >= 0) feed[idx] = event.event;
						else feed.push(event.event);
					}
					if (feed.length > 100) feed.splice(0, feed.length - 100);
					toolFeeds.current.set(event.pid, feed);
					setToolFeedVersion((v) => v + 1);
					break;
				}
			}
		};

		es.onerror = () => {};

		return () => es.close();
	}, []);

	function toolFeedForPid(pid: number): ToolEvent[] {
		return toolFeeds.current.get(pid) ?? [];
	}

	return (
		<SSEContext.Provider value={{ sessions, toolFeedForPid, toolFeedVersion }}>
			{children}
		</SSEContext.Provider>
	);
}
