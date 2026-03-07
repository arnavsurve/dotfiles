export interface ToolEvent {
	toolCallId: string;
	toolName: string;
	argsSummary: string;
	timestamp: string;
	durationMs?: number;
	isError?: boolean;
	done: boolean;
}

export interface SessionState {
	pid: number;
	cwd: string;
	gitRoot?: string;
	model: string | null;
	thinkingLevel: string;
	status: string;
	lastActivity: number;
	lastPrompt: string | null;
	currentTool: string | null;
	tokens: { input: number; output: number };
	cost: number;
	sessionFile: string | null;
	startedAt: string;
	turnCount: number;
	compactionCount: number;
	mcpServers: string[];
	toolHistory: ToolEvent[];
}

export interface WorktreeOverview {
	path: string;
	branch: string | null;
	head: string | null;
	repoRoot: string;
	agents: SessionState[];
	agentCount: number;
	anyActive: boolean;
}

export interface OverviewData {
	metrics: {
		totalCost: number;
		totalInput: number;
		totalOutput: number;
		activeCount: number;
		idleCount: number;
		sessionCount: number;
	};
	worktrees: WorktreeOverview[];
	unmatchedSessions: SessionState[];
}

export interface ChangedFile {
	status: string;
	file: string;
}

export interface Commit {
	hash: string;
	message: string;
	ago: string;
}

export interface PullRequest {
	number: number;
	title: string;
	url: string;
	branch: string;
	repo: string;
	repoFullName: string;
	reviewDecision: string | null;
	additions: number;
	deletions: number;
	createdAt: string;
	draft: boolean;
}

export interface WorktreeDetailData {
	path: string;
	branch: string | null;
	head: string | null;
	dirty: boolean;
	dirtyCount: number;
	changedFiles: ChangedFile[];
	recentCommits: Commit[];
	ahead: number;
	behind: number;
	agents: SessionState[];
	pr: PullRequest | null;
}
