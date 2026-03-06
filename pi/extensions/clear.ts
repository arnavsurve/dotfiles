/**
 * /clear command: start a fresh session without exiting pi.
 * Clears conversation context but keeps AGENTS.md, skills, prompts, extensions, etc.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, _ctx) => {
		pi.registerCommand("clear", {
			description: "Clear conversation context and start a fresh session",
			handler: async (_args, ctx) => {
				await ctx.newSession();
			},
		});
	});
}
