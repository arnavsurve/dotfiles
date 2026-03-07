/**
 * Auto-discover repos from active pi session cwds + configured paths.
 * Resolves git roots, deduplicates, discovers worktrees.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { getWorktreeList, resolveGitRoot, type WorktreeInfo } from "./git.js";
import { store, type SessionState } from "./store.js";

const CONFIG_PATH = path.join(os.homedir(), ".pi", "dashboard", "config.json");

export interface RepoInfo {
	root: string;
	worktrees: WorktreeInfo[];
	sessions: SessionState[];
}

function readConfiguredRepos(): string[] {
	try {
		const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
		const config = JSON.parse(raw);
		return Array.isArray(config.repos) ? config.repos : [];
	} catch {
		return [];
	}
}

export async function discoverRepos(): Promise<RepoInfo[]> {
	const sessions = store.getAllSessions();
	const rootSet = new Map<string, Set<number>>();

	// resolve git roots from all active session cwds
	await Promise.all(
		sessions.map(async (s) => {
			const root = s.gitRoot ?? (await resolveGitRoot(s.cwd));
			if (root) {
				if (!rootSet.has(root)) rootSet.set(root, new Set());
				rootSet.get(root)!.add(s.pid);
				s.gitRoot = root;
			}
		}),
	);

	// add configured repos (even if no active sessions in them)
	for (const repoPath of readConfiguredRepos()) {
		const expanded = repoPath.replace(/^~/, os.homedir());
		if (!rootSet.has(expanded)) {
			rootSet.set(expanded, new Set());
		}
	}

	const repos: RepoInfo[] = [];
	for (const [root, pids] of rootSet) {
		const worktrees = await getWorktreeList(root);
		const allSessions = store.getAllSessions();
		// match sessions to this repo: their cwd starts with any worktree path or the root
		const repoSessions = allSessions.filter(
			(s) => pids.has(s.pid) || worktrees.some((wt) => s.cwd.startsWith(wt.path)),
		);
		repos.push({ root, worktrees, sessions: repoSessions });
	}

	return repos;
}

/**
 * Match a session to its worktree path.
 */
export function sessionWorktree(session: SessionState, worktrees: WorktreeInfo[]): WorktreeInfo | undefined {
	return worktrees.find((wt) => session.cwd.startsWith(wt.path));
}
