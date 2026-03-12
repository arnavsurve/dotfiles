/**
 * Cron Extension — run a task on a repeating interval.
 *
 * Usage: /cron <minutes> <task description>
 *
 * Example: /cron 3 merge main into this branch and surface to me if there are merge conflicts
 *
 * Also registers:
 *   /cron-list  — show active cron jobs
 *   /cron-stop  — stop a cron job (or all if no ID given)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface CronJob {
	id: number;
	intervalMinutes: number;
	task: string;
	timer: ReturnType<typeof setInterval>;
	createdAt: number;
	runCount: number;
}

export default function (pi: ExtensionAPI) {
	const jobs = new Map<number, CronJob>();
	let nextId = 1;

	function clearAllJobs() {
		for (const job of jobs.values()) {
			clearInterval(job.timer);
		}
		jobs.clear();
	}

	pi.registerCommand("cron", {
		description: "Run a task on a repeating interval. Usage: /cron <minutes> <task>",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /cron <minutes> <task>", "error");
				return;
			}

			const match = args.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/s);
			if (!match) {
				ctx.ui.notify("Usage: /cron <minutes> <task>", "error");
				return;
			}

			const minutes = parseFloat(match[1]);
			const task = match[2].trim();

			if (minutes <= 0) {
				ctx.ui.notify("Interval must be positive", "error");
				return;
			}

			const id = nextId++;
			const ms = minutes * 60 * 1000;

			const timer = setInterval(() => {
				const job = jobs.get(id);
				if (!job) return;
				job.runCount++;
				pi.sendUserMessage(task, { deliverAs: "followUp" });
			}, ms);

			const job: CronJob = {
				id,
				intervalMinutes: minutes,
				task,
				timer,
				createdAt: Date.now(),
				runCount: 0,
			};
			jobs.set(id, job);

			ctx.ui.notify(`Cron #${id}: every ${minutes}m → "${task}"`, "info");
			ctx.ui.setStatus("cron", `⏱ ${jobs.size} cron job${jobs.size === 1 ? "" : "s"}`);
		},
	});

	pi.registerCommand("cron-list", {
		description: "List active cron jobs",
		handler: async (_args, ctx) => {
			if (jobs.size === 0) {
				ctx.ui.notify("No active cron jobs", "info");
				return;
			}

			const lines: string[] = [];
			for (const job of jobs.values()) {
				const ago = Math.round((Date.now() - job.createdAt) / 60000);
				lines.push(`#${job.id} — every ${job.intervalMinutes}m — runs: ${job.runCount} — age: ${ago}m — ${job.task}`);
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("cron-stop", {
		description: "Stop a cron job by ID, or all jobs if no ID given. Usage: /cron-stop [id]",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				const count = jobs.size;
				clearAllJobs();
				ctx.ui.setStatus("cron", undefined);
				ctx.ui.notify(count ? `Stopped all ${count} cron job(s)` : "No active cron jobs", "info");
				return;
			}

			const id = parseInt(args.trim(), 10);
			const job = jobs.get(id);
			if (!job) {
				ctx.ui.notify(`Cron #${id} not found`, "error");
				return;
			}

			clearInterval(job.timer);
			jobs.delete(id);
			ctx.ui.notify(`Stopped cron #${id}`, "info");

			if (jobs.size === 0) {
				ctx.ui.setStatus("cron", undefined);
			} else {
				ctx.ui.setStatus("cron", `⏱ ${jobs.size} cron job${jobs.size === 1 ? "" : "s"}`);
			}
		},
	});

	pi.on("session_shutdown", async () => {
		clearAllJobs();
	});

	pi.on("session_before_switch", async () => {
		clearAllJobs();
		return {};
	});
}
