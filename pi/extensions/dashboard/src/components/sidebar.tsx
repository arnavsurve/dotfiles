import { Link, useLocation } from "react-router";
import { useSSE } from "@/lib/sse";
import type { WorktreeOverview } from "@/lib/types";

export function Sidebar({ worktrees }: { worktrees: WorktreeOverview[] }) {
	const location = useLocation();
	const { sessions } = useSSE();
	const isOverview = location.pathname === "/";

	return (
		<aside className="w-[220px] shrink-0 border-r border-border bg-bg2 flex flex-col h-screen sticky top-0">
			<div className="px-5 py-5 border-b border-border">
				<Link to="/" className="text-[18px] font-semibold text-fg">
					<span className="text-accent">π</span> <span className="text-fg2">dashboard</span>
				</Link>
			</div>

			<nav className="flex-1 overflow-y-auto py-3">
				<Link
					to="/"
					className={`flex items-center px-5 py-2.5 text-[13px] transition-colors ${
						isOverview
							? "text-fg bg-bg3 border-l-2 border-accent"
							: "text-fg2 hover:text-fg hover:bg-bg3 border-l-2 border-transparent"
					}`}
				>
					Overview
				</Link>

				{worktrees.length > 0 && (
					<div className="mt-4">
						<div className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-fg3">
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
									className={`flex items-center gap-2 px-5 py-1.5 text-[12px] transition-colors ${
										isActive
											? "text-fg bg-bg3 border-l-2 border-accent"
											: "text-fg2 hover:text-fg hover:bg-bg3 border-l-2 border-transparent"
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
								</Link>
							);
						})}
					</div>
				)}
			</nav>
		</aside>
	);
}
