import { Link, useLocation } from "react-router";
import { useSSE } from "@/lib/sse";
import { useTheme } from "@/lib/theme";
import type { WorktreeOverview } from "@/lib/types";

export function Sidebar({ worktrees }: { worktrees: WorktreeOverview[] }) {
	const location = useLocation();
	const { sessions } = useSSE();
	const { mode, setMode } = useTheme();
	const isOverview = location.pathname === "/";

	return (
		<aside className="w-[260px] shrink-0 border-r border-border bg-bg2 flex flex-col h-screen sticky top-0">
			<div className="px-6 py-6 border-b border-border flex items-center justify-between">
				<span className="text-[36px] font-bold text-fg leading-none">π</span>
				<div className="flex gap-0.5">
					{(["light", "system", "dark"] as const).map((m) => (
						<button
							key={m}
							onClick={() => setMode(m)}
							className={`px-1.5 py-1 text-[9px] uppercase tracking-[1px] transition-colors ${
								mode === m ? "text-fg bg-bg3" : "text-fg3 hover:text-fg2"
							}`}
						>
							{m === "light" ? "☀" : m === "dark" ? "☾" : "◐"}
						</button>
					))}
				</div>
			</div>

			<nav className="flex-1 overflow-y-auto py-4">
				<Link
					to="/"
					className={`block px-6 py-3 text-[14px] font-medium transition-colors ${
						isOverview
							? "text-fg bg-bg3"
							: "text-fg2 hover:text-fg hover:bg-bg3"
					}`}
				>
					Dashboard
				</Link>

				{worktrees.length > 0 && (
					<div className="mt-6">
						<div className="px-6 pb-3 text-[10px] font-bold uppercase tracking-[2px] text-fg3">
							Worktrees
						</div>
						{worktrees.map((wt) => {
							const wtUrl = `/worktree/${encodeURIComponent(wt.path)}`;
							const isActive = decodeURIComponent(location.pathname) === wtUrl || location.pathname === wtUrl;
							const liveAgents = sessions.filter((s) => s.cwd.startsWith(wt.path));
							const anyActive = liveAgents.some((s) => s.status !== "idle");
							const branchShort = wt.branch?.split("/").pop() ?? wt.branch ?? "—";

							return (
								<Link
									key={wt.path}
									to={wtUrl}
									className={`flex items-center gap-2.5 px-6 py-2 text-[13px] transition-colors ${
										isActive
											? "text-fg bg-bg3"
											: "text-fg2 hover:text-fg hover:bg-bg3"
									}`}
								>
									{liveAgents.length > 0 && (
										<span
											className={`w-[6px] h-[6px] rounded-full shrink-0 ${
												anyActive ? "bg-yellow animate-pulse-dot" : "bg-green"
											}`}
										/>
									)}
									<span className="truncate">{branchShort}</span>
									{wt.pr && (
										<span className={`text-[10px] shrink-0 ml-auto ${
											wt.pr.reviewDecision === "APPROVED" ? "text-green"
												: wt.pr.reviewDecision === "CHANGES_REQUESTED" ? "text-red"
												: "text-yellow"
										}`}>
											#{wt.pr.number}
										</span>
									)}
									{wt.stale && (
										<span className="text-[10px] text-fg3 shrink-0 ml-auto">
											{wt.stale.state === "MERGED" ? "✓" : "✗"}
										</span>
									)}
								</Link>
							);
						})}
					</div>
				)}
			</nav>
		</aside>
	);
}
