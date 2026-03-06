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

          const fmt = (n: number) => {
            if (n < 1000) return `${n}`;
            if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
            return `${(n / 1_000_000).toFixed(1)}m`;
          };

          const branch = footerData.getGitBranch();
          const model = ctx.model?.id || "no-model";
          const thinking = pi.getThinkingLevel();
          const cwd = process.cwd().replace(process.env.HOME || "", "~");

          const statuses = footerData.getExtensionStatuses();
          const statusStr =
            statuses.size > 0 ? " " + [...statuses.values()].join(" ") : "";

          const usage = ctx.getContextUsage();
          let ctxPart = "";
          if (usage) {
            const pct = Math.round((usage.tokens / usage.contextWindow) * 100);
            ctxPart = ` ctx: ${fmt(usage.tokens)}/${fmt(usage.contextWindow)} (${pct}%)`;
          }

          const ansi = (r: number, g: number, b: number, text: string) =>
            `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
          const dimGreen = (t: string) => ansi(120, 200, 140, t);
          const dimWhite = (t: string) => ansi(180, 180, 180, t);

          const left =
            theme.fg("dim", `↑${fmt(input)} ↓${fmt(output)}`) +
            " " +
            dimGreen(`$${cost.toFixed(3)}`) +
            (ctxPart ? " " + dimWhite(ctxPart.trim()) : "") +
            statusStr +
            " " +
            theme.fg("muted", cwd);

          const branchPart = branch ? theme.fg("dim", ` ${branch}`) : "";
          const thinkingPart =
            thinking !== "off" ? theme.fg("dim", ` • ${thinking}`) : "";
          const right = theme.fg("muted", model) + branchPart + thinkingPart;

          const pad = " ".repeat(
            Math.max(1, width - visibleWidth(left) - visibleWidth(right)),
          );
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });
}
