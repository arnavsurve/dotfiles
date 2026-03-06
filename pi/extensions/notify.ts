/**
 * Notify Extension — macOS notification + tmux bell when agent finishes.
 *
 * Fires when:
 * - Terminal app is not the frontmost window → macOS notification
 * - Inside tmux and the pane is not active → BEL (triggers tmux visual/audio bell)
 *
 * Includes cwd basename and cost in the notification body.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const BUNDLE_IDS: Record<string, string> = {
	iterm2: "com.googlecode.iterm2",
	iterm: "com.googlecode.iterm2",
	terminal: "com.apple.Terminal",
	ghostty: "com.mitchellh.ghostty",
	wezterm: "org.wezfurlong.wezterm",
	alacritty: "org.alacritty",
	kitty: "net.kovidgoyal.kitty",
};

function detectTerminalBundleId(): string {
	const term = (process.env.TERM_PROGRAM || "").toLowerCase();
	return BUNDLE_IDS[term] || "com.googlecode.iterm2";
}

const TERMINAL_APP_NAMES = Object.keys(BUNDLE_IDS);

async function isTerminalFocused(): Promise<boolean> {
	try {
		const { stdout } = await execAsync(
			`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
		);
		const app = stdout.trim().toLowerCase();
		return TERMINAL_APP_NAMES.some((t) => app.includes(t));
	} catch {
		return true;
	}
}

async function isTmuxPaneActive(): Promise<boolean> {
	if (!process.env.TMUX) return true;
	try {
		const { stdout } = await execAsync("tmux display-message -p '#{window_active}:#{pane_active}'");
		return stdout.trim() === "1:1";
	} catch {
		return true;
	}
}

async function macNotify(title: string, body: string): Promise<void> {
	const bundleId = detectTerminalBundleId();
	await execAsync(
		`terminal-notifier -title "${title}" -message "${body}" -activate ${bundleId}`,
	).catch(() => {});
}

function tmuxBell(): void {
	if (process.env.TMUX) {
		process.stdout.write("\x07");
	}
}

function formatCost(cost: number): string {
	if (cost < 0.01) return `<$0.01`;
	return `$${cost.toFixed(2)}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		const [termFocused, paneActive] = await Promise.all([isTerminalFocused(), isTmuxPaneActive()]);

		if (termFocused && paneActive) return;

		const dir = ctx.cwd.split("/").pop() || ctx.cwd;

		let cost = 0;
		for (const e of ctx.sessionManager.getBranch()) {
			if (e.type === "message" && e.message.role === "assistant") {
				cost += (e.message as AssistantMessage).usage.cost.total;
			}
		}

		const body = `Done in ${dir} (${formatCost(cost)})`;

		if (!termFocused) {
			await macNotify("pi", body);
		}

		if (!paneActive) {
			tmuxBell();
		}
	});
}
