/**
 * Injects open PR context (number, URL, title, review status) into the first
 * agent turn via before_agent_start so the LLM knows about it without being
 * asked. Only runs `gh pr view` once per session and caches the result.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface PrInfo {
	number: number;
	title: string;
	url: string;
	state: string;
	reviewDecision: string;
}

export default function (pi: ExtensionAPI) {
	let prInfo: PrInfo | null = null;
	let checked = false;

	async function fetchPr(): Promise<PrInfo | null> {
		if (checked) return prInfo;
		checked = true;

		try {
			const result = await pi.exec("gh", [
				"pr", "view", "--json", "number,title,url,state,reviewDecision",
			], { timeout: 5000 });

			if (result.code !== 0) return null;
			const data = JSON.parse(result.stdout);
			if (data.state !== "OPEN") return null;

			prInfo = data;
			return prInfo;
		} catch {
			return null;
		}
	}

	pi.on("before_agent_start", async (_event, _ctx) => {
		const pr = await fetchPr();
		if (!pr) return;

		const review = pr.reviewDecision
			? ` | review: ${pr.reviewDecision}`
			: "";

		return {
			message: {
				customType: "pr-context",
				content: `[PR #${pr.number}] ${pr.title} (${pr.url}${review})`,
				display: false,
			},
		};
	});
}
