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

interface AggCost {
	cost: number;
	tokensIn: number;
	tokensOut: number;
}

const RANGES = ["today", "wtd", "mtd", "all"] as const;
const RANGE_LABELS: Record<string, string> = { today: "Today", wtd: "Week", mtd: "Month", all: "All" };

export function Overview() {
	const { sessions } = useSSE();
	const [data, setData] = useState<OverviewData | null>(null);
	const [prs, setPrs] = useState<PullRequest[]>([]);
	const [timeseries, setTimeseries] = useState<TimeseriesBucket[]>([]);
	const [toolBreakdown, setToolBreakdown] = useState<ToolBreakdownItem[]>([]);
	const [costRange, setCostRange] = useState<string>("today");
	const [aggCost, setAggCost] = useState<AggCost>({ cost: 0, tokensIn: 0, tokensOut: 0 });
	const [costVisible, setCostVisible] = useState(false);

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

	useEffect(() => {
		fetch(`/api/cost?range=${costRange}`).then((r) => r.json()).then(setAggCost);
		const i = setInterval(() => {
			fetch(`/api/cost?range=${costRange}`).then((r) => r.json()).then(setAggCost);
		}, 5000);
		return () => clearInterval(i);
	}, [costRange]);

	let totalInput = 0, totalOutput = 0, activeCount = 0;
	for (const s of sessions) {
		totalInput += s.tokens.input;
		totalOutput += s.tokens.output;
		if (s.status !== "idle") activeCount++;
	}

	const costData = timeseries.map((b) => b.cost);
	const tokenData = timeseries.map((b) => b.tokens_in + b.tokens_out);
	const toolCallData = timeseries.map((b) => b.tool_calls);

	return (
		<div className="flex min-h-screen">
			<Sidebar worktrees={data?.worktrees ?? []} />

			<main className="flex-1 p-6 space-y-4 overflow-y-auto">
				{/* Top row — 3 metric panels */}
				<div className="grid grid-cols-3 gap-4">
					<Panel
						label="TOTAL COST"
						sublabel={
							<div className="flex gap-1">
								{RANGES.map((r) => (
									<button
										key={r}
										onClick={() => setCostRange(r)}
										className={`px-1.5 py-0.5 text-[9px] uppercase tracking-[1.5px] transition-colors ${
											costRange === r ? "text-fg bg-bg3" : "text-fg3 hover:text-fg2"
										}`}
									>
										{RANGE_LABELS[r]}
									</button>
								))}
							</div>
						}
					>
						<div className="flex items-center gap-2">
							<div className="text-[24px] font-bold text-fg leading-none tracking-tight">
								{costVisible ? fmtCost(aggCost.cost) : "••••••"}
							</div>
							<button
								onClick={() => setCostVisible(!costVisible)}
								className="text-fg3 hover:text-fg transition-colors"
							>
								{costVisible ? (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								) : (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								)}
							</button>
						</div>
						<div className="mt-6 h-[80px] overflow-hidden">
							{costData.length > 2 ? (
								<Sparkline data={costData} />
							) : (
								<div className="h-full flex items-end">
									<div className="w-full h-px bg-border" />
								</div>
							)}
						</div>
					</Panel>

					<Panel label="RUNNING AGENTS" sublabel={<span>{sessions.length} TOTAL</span>}>
						<div className="text-[32px] font-bold text-fg leading-none tracking-tight">
							{activeCount > 0 ? activeCount : sessions.length}
							<span className="text-[14px] font-normal text-fg2 ml-2">
								{activeCount > 0 ? "Active" : "Idle"}
							</span>
						</div>
						<div className="mt-6 space-y-3">
							{sessions.map((s) => (
								<div key={s.pid} className="flex items-center gap-3 text-[13px]">
									<span
										className={`w-2 h-2 shrink-0 ${
											s.status === "idle"
												? "bg-green"
												: s.status === "streaming"
													? "bg-yellow animate-pulse-dot"
													: "bg-fg animate-pulse-dot"
										}`}
									/>
									<span className="text-fg">{shortModel(s.model)}</span>
									<span className="text-fg3">{statusLabel(s.status)}</span>
									<span className="ml-auto text-fg2">{fmtCost(s.cost)}</span>
								</div>
							))}
							{sessions.length === 0 && (
								<div className="text-fg3 text-[13px]">No active sessions</div>
							)}
						</div>
					</Panel>

					<Panel label="TOKENS" sublabel={<span>SESSION</span>}>
						<div className="flex items-baseline gap-6">
							<div>
								<div className="text-[32px] font-bold text-fg leading-none tracking-tight">{fmtTokens(totalInput)}</div>
								<div className="text-[10px] text-fg3 mt-1 uppercase tracking-[2px]">Input</div>
							</div>
							<div>
								<div className="text-[32px] font-bold text-fg leading-none tracking-tight">{fmtTokens(totalOutput)}</div>
								<div className="text-[10px] text-fg3 mt-1 uppercase tracking-[2px]">Output</div>
							</div>
						</div>
						<div className="mt-6 h-[80px] overflow-hidden">
							{tokenData.length > 2 ? (
								<Sparkline data={tokenData} />
							) : (
								<div className="h-full flex items-end">
									<div className="w-full h-px bg-border" />
								</div>
							)}
						</div>
					</Panel>
				</div>

				{/* Middle row */}
				<div className="grid grid-cols-2 gap-4">
					<Panel label="OPEN PRS" sublabel={prs.length > 0 ? <span>{prs.length}</span> : undefined}>
						{prs.length === 0 ? (
							<div className="text-fg3 text-[13px]">No open PRs</div>
						) : (
							<div>
								{prs.map((pr) => (
									<a
										key={pr.number}
										href={pr.url}
										target="_blank"
										rel="noopener"
										className="flex items-center gap-4 py-3 text-[13px] border-b border-border last:border-0 hover:bg-bg3 -mx-6 px-6 transition-colors"
									>
										<span className="text-fg3 w-16 shrink-0">#{pr.number}</span>
										<span className="text-fg truncate flex-1">{pr.title}</span>
										<ReviewBadge decision={pr.reviewDecision} draft={pr.draft} />
										<span className="text-fg3 shrink-0">
											<span className="text-green">+{pr.additions}</span>{" "}
											<span className="text-red">-{pr.deletions}</span>
										</span>
									</a>
								))}
							</div>
						)}
					</Panel>

					<Panel label="TOOL CALLS" sublabel={<span>24H</span>}>
						{toolCallData.length > 2 ? (
							<>
								<div className="h-[120px] mb-6 overflow-hidden">
									<BarChart data={toolCallData} />
								</div>
								<HorizontalBars
									items={toolBreakdown.slice(0, 6).map((t) => ({ label: t.tool_name, value: t.total }))}
								/>
							</>
						) : (
							<div className="text-fg3 text-[13px]">No tool call data yet</div>
						)}
					</Panel>
				</div>

				{/* Worktrees panel */}
				<Panel label="WORKTREES" sublabel={data ? <span>{data.worktrees.length}</span> : undefined}>
					{data ? (
						<div>
							{data.worktrees.map((wt) => {
								const liveAgents = sessions.filter((s) => s.cwd.startsWith(wt.path));
								const anyActive = liveAgents.some((s) => s.status !== "idle");

								return (
									<Link
										key={wt.path}
										to={`/worktree/${encodeURIComponent(wt.path)}`}
										className={`flex items-center gap-4 py-3 border-b border-border last:border-0 hover:bg-bg3 -mx-6 px-6 transition-colors ${wt.stale ? "opacity-40" : ""}`}
									>
										<span className={`font-semibold text-[13px] shrink-0 ${wt.stale ? "text-fg3 line-through" : "text-accent"}`}>
											{wt.branch ?? "(detached)"}
										</span>
										{wt.pr && (
											<span className="text-[11px] text-fg3 shrink-0">
												#{wt.pr.number}
												{wt.pr.reviewDecision === "APPROVED" && <span className="text-green ml-1">approved</span>}
												{wt.pr.reviewDecision === "REVIEW_REQUIRED" && <span className="text-yellow ml-1">pending</span>}
												{wt.pr.reviewDecision === "CHANGES_REQUESTED" && <span className="text-red ml-1">changes</span>}
											</span>
										)}
										<span className="text-[11px] text-fg3 truncate">
											{wt.path.replace(/^\/Users\/\w+\//, "~/")}
										</span>
										<span className="ml-auto flex items-center gap-2 shrink-0">
											{liveAgents.length > 0 && (
												<span
													className={`text-[11px] px-2 py-0.5 ${
														anyActive ? "bg-bg3 text-yellow" : "bg-bg3 text-green"
													}`}
												>
													{liveAgents.length} agent{liveAgents.length > 1 ? "s" : ""}
												</span>
											)}
											{wt.stale && (
												<span className="text-[10px] px-2 py-0.5 bg-bg3 text-fg3 uppercase tracking-wider">
													{wt.stale.state === "MERGED" ? "merged" : "closed"}
												</span>
											)}
										</span>
									</Link>
								);
							})}
						</div>
					) : (
						<div className="text-fg3 text-[13px]">Loading...</div>
					)}
				</Panel>
			</main>
		</div>
	);
}

function Panel({ label, sublabel, children }: { label: string; sublabel?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="bg-bg2 border border-border p-6">
			<div className="flex items-baseline justify-between mb-4">
				<span className="text-[10px] font-bold uppercase tracking-[2px] text-fg3">{label}</span>
				{sublabel && <span className="text-[10px] uppercase tracking-[2px] text-fg3">{sublabel}</span>}
			</div>
			{children}
		</div>
	);
}

function ReviewBadge({ decision, draft }: { decision: string | null; draft: boolean }) {
	if (draft) return <span className="text-[11px] text-fg3 uppercase tracking-wider">Draft</span>;
	if (decision === "APPROVED") return <span className="text-[11px] text-green uppercase tracking-wider">Approved</span>;
	if (decision === "CHANGES_REQUESTED") return <span className="text-[11px] text-red uppercase tracking-wider">Changes</span>;
	return <span className="text-[11px] text-yellow uppercase tracking-wider">Pending</span>;
}
