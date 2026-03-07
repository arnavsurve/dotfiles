import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BarChart, HorizontalBars, Sparkline } from "@/components/charts";
import { Sidebar } from "@/components/sidebar";
import { useSSE } from "@/lib/sse";
import type { OverviewData, PullRequest } from "@/lib/types";
import { fmtCost, fmtTokens, shortModel, statusLabel } from "@/lib/utils";

interface TimeseriesBucket {
	bucket_start: number;
	cost: number;
	tokens_in: number;
	tokens_out: number;
	tool_calls: number;
}

interface ToolBreakdownItem {
	tool_name: string;
	total: number;
}

export function Overview() {
	const { sessions } = useSSE();
	const [data, setData] = useState<OverviewData | null>(null);
	const [prs, setPrs] = useState<PullRequest[]>([]);
	const [timeseries, setTimeseries] = useState<TimeseriesBucket[]>([]);
	const [toolBreakdown, setToolBreakdown] = useState<ToolBreakdownItem[]>([]);

	useEffect(() => {
		const loadAll = () => {
			fetch("/api/overview").then((r) => r.json()).then(setData);
			fetch("/api/prs").then((r) => r.json()).then(setPrs);
			fetch("/api/timeseries?hours=6").then((r) => r.json()).then(setTimeseries);
			fetch("/api/tool-breakdown?hours=24").then((r) => r.json()).then(setToolBreakdown);
		};
		loadAll();
		const i = setInterval(loadAll, 5000);
		return () => clearInterval(i);
	}, []);

	let totalCost = 0, totalInput = 0, totalOutput = 0, activeCount = 0;
	for (const s of sessions) {
		totalCost += s.cost;
		totalInput += s.tokens.input;
		totalOutput += s.tokens.output;
		if (s.status !== "idle") activeCount++;
	}

	const costData = timeseries.map((b) => b.cost);
	const toolCallData = timeseries.map((b) => b.tool_calls);

	return (
		<div className="flex min-h-screen">
			<Sidebar worktrees={data?.worktrees ?? []} />

			<main className="flex-1 p-5 space-y-3 overflow-y-auto">
				{/* Top metric cards */}
				<div className="grid grid-cols-3 gap-3">
					<Panel label="Total Cost" sublabel="session">
						<div className="text-[28px] font-bold text-fg leading-none mb-4">
							{fmtCost(totalCost)}
						</div>
						<div className="h-[60px]">
							{costData.length > 2 ? (
								<Sparkline data={costData} width={280} height={60} color="var(--color-fg3)" />
							) : (
								<div className="h-full flex items-end">
									<div className="w-full h-[1px] bg-border" />
								</div>
							)}
						</div>
					</Panel>

					<Panel label="Agents" sublabel={`${sessions.length} total`}>
						<div className="text-[28px] font-bold text-fg leading-none mb-4">
							{activeCount > 0 ? (
								<>{activeCount} <span className="text-[14px] font-normal text-fg2">active</span></>
							) : sessions.length > 0 ? (
								<>{sessions.length} <span className="text-[14px] font-normal text-fg2">idle</span></>
							) : (
								<span className="text-fg3">—</span>
							)}
						</div>
						<div className="space-y-2">
							{sessions.map((s) => (
								<div key={s.pid} className="flex items-center gap-2 text-[12px]">
									<span
										className={`w-[6px] h-[6px] rounded-full shrink-0 ${
											s.status === "idle"
												? "bg-green"
												: s.status === "streaming"
													? "bg-yellow animate-pulse-dot"
													: "bg-teal animate-pulse-dot"
										}`}
									/>
									<span className="text-fg">{shortModel(s.model)}</span>
									<span className="text-fg3">{statusLabel(s.status)}</span>
									<span className="ml-auto text-fg2">{fmtCost(s.cost)}</span>
								</div>
							))}
						</div>
					</Panel>

					<Panel label="Tokens" sublabel="session">
						<div className="flex items-baseline gap-4 mb-4">
							<div>
								<span className="text-[28px] font-bold text-fg leading-none">{fmtTokens(totalInput)}</span>
								<span className="text-[13px] text-fg3 ml-1.5">in</span>
							</div>
							<div>
								<span className="text-[28px] font-bold text-fg leading-none">{fmtTokens(totalOutput)}</span>
								<span className="text-[13px] text-fg3 ml-1.5">out</span>
							</div>
						</div>
					</Panel>
				</div>

				{/* Middle row */}
				<div className="grid grid-cols-2 gap-3">
					<Panel label="Open PRs" sublabel={prs.length > 0 ? `${prs.length}` : undefined}>
						{prs.length === 0 ? (
							<p className="text-fg3 text-[12px] italic pt-2">No open PRs</p>
						) : (
							<div className="space-y-1 pt-1">
								{prs.map((pr) => (
									<a
										key={pr.number}
										href={pr.url}
										target="_blank"
										rel="noopener"
										className="flex items-center gap-3 py-2 px-2 -mx-2 text-[12px] hover:bg-bg3 rounded transition-colors"
									>
										<span className="text-fg3 w-14 shrink-0">#{pr.number}</span>
										<span className="text-fg truncate flex-1">{pr.title}</span>
										<ReviewBadge decision={pr.reviewDecision} draft={pr.draft} />
										<span className="text-fg3 w-14 text-right shrink-0">
											<span className="text-green">+{pr.additions}</span>{" "}
											<span className="text-red">-{pr.deletions}</span>
										</span>
									</a>
								))}
							</div>
						)}
					</Panel>

					<Panel label="Tool Calls" sublabel="24h">
						{toolCallData.length > 2 ? (
							<>
								<div className="h-[80px] mb-4">
									<BarChart data={toolCallData} width={440} height={80} color="var(--color-fg)" />
								</div>
								<HorizontalBars
									items={toolBreakdown.slice(0, 6).map((t) => ({ label: t.tool_name, value: t.total }))}
								/>
							</>
						) : (
							<p className="text-fg3 text-[12px] italic pt-2">No tool call data yet</p>
						)}
					</Panel>
				</div>

				{/* Worktrees */}
				<Panel label="Worktrees" sublabel={data ? `${data.worktrees.length}` : undefined}>
					{data ? (
						<div className="pt-1">
							{data.worktrees.map((wt) => {
								const liveAgents = sessions.filter((s) => s.cwd.startsWith(wt.path));
								const anyActive = liveAgents.some((s) => s.status !== "idle");

								return (
									<Link
										key={wt.path}
										to={`/worktree/${encodeURIComponent(wt.path)}`}
										className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded hover:bg-bg3 transition-colors"
									>
										<span className="font-semibold text-accent text-[13px] shrink-0">
											{wt.branch ?? "(detached)"}
										</span>
										<span className="text-[11px] text-fg3 truncate">
											{wt.path.replace(/^\/Users\/\w+\//, "~/")}
										</span>
										{liveAgents.length > 0 && (
											<span
												className={`ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded ${
													anyActive
														? "bg-yellow/10 text-yellow"
														: "bg-green/10 text-green"
												}`}
											>
												{liveAgents.length} agent{liveAgents.length > 1 ? "s" : ""}
											</span>
										)}
									</Link>
								);
							})}
						</div>
					) : (
						<p className="text-fg3 text-[12px] italic pt-2">Loading...</p>
					)}
				</Panel>
			</main>
		</div>
	);
}

function Panel({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
	return (
		<div className="bg-bg2 border border-border rounded-md p-5">
			<div className="flex items-baseline justify-between mb-2">
				<span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-fg3">{label}</span>
				{sublabel && <span className="text-[11px] text-fg3">{sublabel}</span>}
			</div>
			{children}
		</div>
	);
}

function ReviewBadge({ decision, draft }: { decision: string | null; draft: boolean }) {
	if (draft) return <span className="text-[11px] text-fg3">draft</span>;
	if (decision === "APPROVED") return <span className="text-[11px] text-green">approved</span>;
	if (decision === "CHANGES_REQUESTED") return <span className="text-[11px] text-red">changes</span>;
	return <span className="text-[11px] text-yellow">pending</span>;
}
