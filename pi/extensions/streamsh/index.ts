import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

function getSocketPath(): string {
	if (process.env.STREAMSH_SOCKET) return process.env.STREAMSH_SOCKET;
	const xdg = process.env.XDG_RUNTIME_DIR;
	if (xdg) return path.join(xdg, "streamsh.sock");
	return path.join(os.tmpdir(), `streamsh-${process.getuid!()}`, "streamsh.sock");
}

interface Envelope {
	type: string;
	payload?: any;
}

async function roundTrip(socketPath: string, req: Envelope): Promise<any> {
	return new Promise((resolve, reject) => {
		const sock = net.createConnection(socketPath);
		const rl = readline.createInterface({ input: sock });

		sock.on("error", (err) => reject(new Error(`streamsh daemon: ${err.message}`)));

		rl.once("line", (line) => {
			rl.close();
			sock.end();
			const env: Envelope = JSON.parse(line);
			if (env.type === "error") {
				reject(new Error(env.payload?.message ?? "unknown error"));
			} else {
				resolve(env.payload);
			}
		});

		sock.write(JSON.stringify(req) + "\n");
	});
}

export default function (pi: ExtensionAPI) {
	const socketPath = getSocketPath();

	pi.registerTool({
		name: "list_sessions",
		label: "List Sessions",
		description:
			"List all terminal sessions tracked by streamsh. Returns each session's ID, title, last command, line count, and connection status.",
		parameters: Type.Object({}),
		promptGuidelines: [
			"Use list_sessions to discover active terminal sessions before querying them.",
			"After making code changes, check relevant sessions for errors or confirmation.",
			"When the user mentions an error or unexpected behavior, check sessions for logs.",
		],
		async execute() {
			const result = await roundTrip(socketPath, { type: "list_sessions" });
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "query_session",
		label: "Query Session",
		description:
			"Read output from a terminal session. Use last_n for recent output, search for pattern matching, or cursor for pagination.",
		parameters: Type.Object({
			session: Type.String({
				description: "Session identifier: short ID, UUID, or title",
			}),
			search: Type.Optional(Type.String({ description: "Fuzzy/substring search pattern" })),
			last_n: Type.Optional(Type.Number({ description: "Return the last N lines" })),
			cursor: Type.Optional(Type.Number({ description: "Start from this sequence number" })),
			count: Type.Optional(
				Type.Number({
					description: "Lines to return in cursor mode (default 100)",
				}),
			),
			max_results: Type.Optional(Type.Number({ description: "Max search results (default 50)" })),
		}),
		async execute(_toolCallId, params) {
			const result = await roundTrip(socketPath, {
				type: "query_session",
				payload: params,
			});
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "write_session",
		label: "Write Session",
		description:
			"Send raw text input to a collaborative shell session. To execute a command, include a newline at the end. Only works on sessions started with --collab.",
		parameters: Type.Object({
			session: Type.String({
				description: "Session identifier: short ID, UUID, or title",
			}),
			text: Type.String({ description: "Raw text to write to the PTY" }),
		}),
		async execute(_toolCallId, params) {
			const result = await roundTrip(socketPath, {
				type: "write_session",
				payload: params,
			});
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
			};
		},
	});
}
