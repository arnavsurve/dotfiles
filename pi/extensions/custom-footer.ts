/**
 * Custom footer: compact token/cost layout + cwd + git branch + model + thinking level
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					let input = 0,
						output = 0,
						cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cost += m.usage.cost.total;
						}
					}

					const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);

					const branch = footerData.getGitBranch();
					const model = ctx.model?.id || "no-model";
					const thinking = pi.getThinkingLevel();
					const cwd = process.cwd().replace(process.env.HOME || "", "~");

					const statuses = footerData.getExtensionStatuses();
					const statusStr = statuses.size > 0 ? " " + [...statuses.values()].join(" ") : "";

					const usage = ctx.getContextUsage();
					let ctxPart = "";
					if (usage) {
						const pct = Math.round((usage.tokens / usage.contextWindow) * 100);
						ctxPart = ` ctx:${fmt(usage.tokens)}/${fmt(usage.contextWindow)} ${pct}%`;
					}

					const left = theme.fg("dim", `↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}${ctxPart}`)
						+ statusStr
						+ " "
						+ theme.fg("muted", cwd);

					const branchPart = branch ? theme.fg("dim", ` ${branch}`) : "";
					const thinkingPart = thinking !== "off" ? theme.fg("dim", ` • ${thinking}`) : "";
					const right = theme.fg("muted", model) + branchPart + thinkingPart;

					const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});
}
