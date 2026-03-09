/**
 * Injects open PR context (number, URL, title, review status) into the first
 * agent turn via before_agent_start so the LLM knows about it without being
 * asked. Only runs `gh pr view` once per session and caches the result.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let injected = false;

	pi.on("session_start", async (_event, ctx) => {
		try {
			const result = await pi.exec(
				"gh",
				["pr", "view", "--json", "number,title,url,state,reviewDecision"],
				{ timeout: 5000 },
			);

			if (result.code !== 0) return;
			const data = JSON.parse(result.stdout);
			if (data.state !== "OPEN") return;

			const ansi = (r: number, g: number, b: number, text: string) =>
				`\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;

			let label: string;
			switch (data.reviewDecision) {
				case "APPROVED":
					label = ansi(120, 200, 140, `PR #${data.number} ✓`);
					break;
				case "CHANGES_REQUESTED":
					label = ansi(220, 80, 80, `PR #${data.number} ✗`);
					break;
				default:
					label = ansi(230, 170, 60, `PR #${data.number} •`);
					break;
			}

			ctx.ui.setStatus("pr", label);
		} catch {
			// no PR or gh not available
		}
	});

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (injected) return;

		try {
			const result = await pi.exec(
				"gh",
				["pr", "view", "--json", "number,title,url,state,reviewDecision"],
				{ timeout: 5000 },
			);

			if (result.code !== 0) return;
			const data = JSON.parse(result.stdout);
			if (data.state !== "OPEN") return;

			injected = true;

			const review = data.reviewDecision ? ` | review: ${data.reviewDecision}` : "";

			return {
				message: {
					customType: "pr-context",
					content: `[PR #${data.number}] ${data.title} (${data.url}${review})`,
					display: false,
				},
			};
		} catch {
			return;
		}
	});
}
