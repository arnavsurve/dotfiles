import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Sidebar } from "@/components/sidebar";
import { useSSE } from "@/lib/sse";
import type { OverviewData, WorktreeDetailData } from "@/lib/types";
import { fmtCost, fmtTime, fmtTokens, shortModel, statusLabel, timeAgo } from "@/lib/utils";

export function WorktreeDetail() {
	const location = useLocation();
	const wtPath = decodeURIComponent(location.pathname.replace("/worktree/", ""));
	const { sessions, toolFeedForPid } = useSSE();
	const [data, setData] = useState<WorktreeDetailData | null>(null);
	const [selectedPid, setSelectedPid] = useState<number | null>(null);

	const navigate = useNavigate();
	const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
	const liveAgents = sessions.filter((s) => s.cwd.startsWith(wtPath));

	useEffect(() => {
		fetch("/api/overview").then((r) => r.json()).then(setOverviewData);
		const i = setInterval(() => fetch("/api/overview").then((r) => r.json()).then(setOverviewData), 10000);
		return () => clearInterval(i);
	}, []);

	async function removeWorktree() {
		if (!confirm(`Remove worktree ${data?.branch ?? wtPath}? This will delete the directory.`)) return;
		const res = await fetch("/api/worktree/remove", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: wtPath }),
		});
		if (res.ok) navigate("/");
		else {
			const err = await res.json();
			alert(`Failed: ${err.error}`);
		}
	}

	useEffect(() => {
		const load = () =>
			fetch(`/api/worktree?path=${encodeURIComponent(wtPath)}`)
				.then((r) => r.json())
				.then(setData);
		load();
		const i = setInterval(load, 5000);
		return () => clearInterval(i);
	}, [wtPath]);

	// auto-select first agent if none selected
	useEffect(() => {
		if (!selectedPid && liveAgents.length > 0) {
			setSelectedPid(liveAgents[0].pid);
		}
	}, [liveAgents, selectedPid]);

	const selectedFeed = selectedPid ? toolFeedForPid(selectedPid) : [];

	return (
		<div className="flex h-screen min-h-screen">
			<Sidebar worktrees={overviewData?.worktrees ?? []} />

			{/* Main content */}
			<div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
				<div className="flex items-center gap-3">
					<Link to="/" className="text-accent text-xs hover:underline">← back</Link>
					<button
						onClick={removeWorktree}
						className="ml-auto text-[11px] text-fg3 hover:text-red transition-colors"
					>
						remove worktree
					</button>
				</div>

				{/* Header */}
				<div>
					<h1 className="text-lg font-semibold text-accent">
						{data?.branch ?? wtPath.split("/").pop()}
					</h1>
					<div className="flex items-center gap-3 text-[11px] text-fg3 mt-1">
						<span>{wtPath}</span>
						{data && data.ahead > 0 && <span>↑{data.ahead} ahead</span>}
						{data && data.behind > 0 && <span>↓{data.behind} behind</span>}
						{data && (
							<span className={data.dirty ? "text-yellow" : "text-green"}>
								{data.dirty ? `${data.dirtyCount} changed` : "clean"}
							</span>
						)}
					</div>
				</div>

				{/* PR */}
				{data?.pr && (
					<a
						href={data.pr.url}
						target="_blank"
						rel="noopener"
						className="flex items-center gap-3 px-3 py-2 rounded bg-bg2 border border-border text-xs hover:border-[#333] transition-colors"
					>
						<span className="text-fg3">#{data.pr.number}</span>
						<span className="text-fg truncate flex-1">{data.pr.title}</span>
						<span className="text-green">+{data.pr.additions}</span>
						<span className="text-red">-{data.pr.deletions}</span>
					</a>
				)}

				{/* Agent sessions */}
				{liveAgents.length > 0 && (
					<section>
						<h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-fg3 mb-2">
							Agent Sessions
						</h2>
						<div className="space-y-2">
							{liveAgents.map((a) => (
								<button
									key={a.pid}
									onClick={() => setSelectedPid(a.pid)}
									className={`w-full text-left rounded-md p-3 transition-colors ${
										selectedPid === a.pid
											? "bg-bg3 border border-accent"
											: "bg-bg2 border border-border hover:border-[#333]"
									}`}
								>
									<div className="flex items-center gap-2 text-xs">
										<span
											className={`w-[7px] h-[7px] rounded-full shrink-0 ${
												a.status === "idle"
													? "bg-green"
													: a.status === "streaming"
														? "bg-yellow animate-pulse-dot"
														: "bg-teal animate-pulse-dot"
											}`}
										/>
										<span className="text-fg2">{shortModel(a.model)}</span>
										<span className="text-fg3">{statusLabel(a.status)}</span>
										<span className="ml-auto text-fg3">{fmtCost(a.cost)}</span>
										<span className="text-fg3">
											{fmtTokens(a.tokens.input + a.tokens.output)} tok
										</span>
									</div>
									{a.lastPrompt && (
										<p className="text-[11px] text-fg truncate mt-1">
											{a.lastPrompt}
										</p>
									)}
								</button>
							))}
						</div>
					</section>
				)}

				{/* Changed files */}
				{data && data.changedFiles.length > 0 && (
					<section>
						<h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-fg3 mb-2">
							Changed Files
						</h2>
						<div className="space-y-px text-xs">
							{data.changedFiles.map((f, i) => (
								<div key={i} className="flex gap-2 py-0.5">
									<span
										className={`w-4 text-center shrink-0 ${
											f.status === "A" || f.status === "?"
												? "text-green"
												: f.status === "D"
													? "text-red"
													: "text-yellow"
										}`}
									>
										{f.status}
									</span>
									<span className="text-fg2">{f.file}</span>
								</div>
							))}
							{data.dirtyCount > 30 && (
								<p className="text-fg3 pt-1">...and {data.dirtyCount - 30} more</p>
							)}
						</div>
					</section>
				)}

				{/* Recent commits */}
				{data && data.recentCommits.length > 0 && (
					<section>
						<h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-fg3 mb-2">
							Recent Commits
						</h2>
						<div className="space-y-px text-xs">
							{data.recentCommits.map((c) => (
								<div key={c.hash} className="flex gap-3 py-0.5">
									<span className="text-fg3 w-20 shrink-0">{c.hash}</span>
									<span className="text-fg2 truncate flex-1">{c.message}</span>
									<span className="text-fg3 shrink-0">{c.ago}</span>
								</div>
							))}
						</div>
					</section>
				)}
			</div>

			{/* Sidebar — tool call feed */}
			{liveAgents.length > 0 && (
				<ToolFeedSidebar
					agents={liveAgents}
					selectedPid={selectedPid}
					onSelectPid={setSelectedPid}
					feed={selectedFeed}
				/>
			)}
		</div>
	);
}

function ToolFeedSidebar({
	agents,
	selectedPid,
	onSelectPid,
	feed,
}: {
	agents: { pid: number; model: string | null; status: string }[];
	selectedPid: number | null;
	onSelectPid: (pid: number) => void;
	feed: { toolCallId: string; toolName: string; argsSummary: string; timestamp: string; durationMs?: number; isError?: boolean; done: boolean }[];
}) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [feed.length]);

	return (
		<div className="w-[320px] border-l border-border flex flex-col bg-bg2">
			{/* Agent tabs */}
			{agents.length > 1 && (
				<div className="flex border-b border-border">
					{agents.map((a) => (
						<button
							key={a.pid}
							onClick={() => onSelectPid(a.pid)}
							className={`flex-1 px-3 py-2 text-[11px] transition-colors ${
								selectedPid === a.pid
									? "text-accent border-b border-accent"
									: "text-fg3 hover:text-fg2"
							}`}
						>
							{shortModel(a.model)}
						</button>
					))}
				</div>
			)}

			<div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[1px] text-fg3">
				Tool Calls
			</div>

			{/* Feed */}
			<div className="flex-1 overflow-y-auto px-3 space-y-px">
				{feed.length === 0 && (
					<p className="text-fg3 text-[11px] italic py-2">Waiting for tool calls...</p>
				)}
				{feed.map((t) => (
					<div key={t.toolCallId} className="flex items-center gap-2 py-1 text-[11px]">
						<span className="text-fg3 w-16 shrink-0">{fmtTime(t.timestamp)}</span>
						<span className="text-fg2 w-12 shrink-0">{t.toolName}</span>
						<span className="text-fg3 truncate flex-1">{t.argsSummary}</span>
						{t.done ? (
							<>
								<span className="text-fg3 shrink-0">{t.durationMs}ms</span>
								<span className={t.isError ? "text-red" : "text-green"}>
									{t.isError ? "✗" : "✓"}
								</span>
							</>
						) : (
							<span className="text-yellow animate-pulse-dot shrink-0">●</span>
						)}
					</div>
				))}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
