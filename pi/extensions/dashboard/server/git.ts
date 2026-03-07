/**
 * Git data fetching with stale-while-revalidate caching.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const GIT_TIMEOUT = 3_000;

interface CacheEntry<T> {
	data: T;
	fetchedAt: number;
	ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (!entry) return null;
	return entry.data;
}

function isStale(key: string): boolean {
	const entry = cache.get(key);
	if (!entry) return true;
	return Date.now() - entry.fetchedAt > entry.ttl;
}

function setCache<T>(key: string, data: T, ttl: number) {
	cache.set(key, { data, fetchedAt: Date.now(), ttl });
}

async function gitExec(cwd: string, args: string): Promise<string> {
	try {
		const { stdout } = await execAsync(`git -C "${cwd}" ${args}`, { timeout: GIT_TIMEOUT });
		return stdout;
	} catch {
		return "";
	}
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

export interface WorktreeInfo {
	path: string;
	branch: string | null;
	head: string | null;
}

export interface WorktreeDetail {
	path: string;
	branch: string | null;
	head: string | null;
	dirty: boolean;
	dirtyCount: number;
	changedFiles: ChangedFile[];
	recentCommits: Commit[];
	ahead: number;
	behind: number;
}

export async function resolveGitRoot(cwd: string): Promise<string | null> {
	const key = `gitroot:${cwd}`;
	const cached = getCached<string>(key);
	if (cached) return cached;

	const out = await gitExec(cwd, "rev-parse --show-toplevel");
	const root = out.trim() || null;
	if (root) setCache(key, root, 300_000); // cache 5 min, git roots don't change
	return root;
}

export async function isBareRepo(root: string): Promise<boolean> {
	const out = await gitExec(root, "rev-parse --is-bare-repository");
	return out.trim() === "true";
}

export async function getWorktreeList(repoRoot: string): Promise<WorktreeInfo[]> {
	const key = `worktrees:${repoRoot}`;
	const cached = getCached<WorktreeInfo[]>(key);
	if (cached && !isStale(key)) return cached;

	// return stale if available, refresh in background
	if (cached) {
		refreshWorktreeList(repoRoot);
		return cached;
	}

	return refreshWorktreeList(repoRoot);
}

async function refreshWorktreeList(repoRoot: string): Promise<WorktreeInfo[]> {
	const key = `worktrees:${repoRoot}`;

	// check for bare checkout convention: ~/repo/.bare/
	const { existsSync } = await import("node:fs");
	const barePath = repoRoot + "/.bare";
	const gitDir = existsSync(barePath) ? barePath : repoRoot;
	const bare = await isBareRepo(gitDir);

	if (!bare) {
		const branch = (await gitExec(repoRoot, "rev-parse --abbrev-ref HEAD")).trim() || null;
		const head = (await gitExec(repoRoot, "rev-parse HEAD")).trim() || null;
		const result = [{ path: repoRoot, branch, head }];
		setCache(key, result, 30_000);
		return result;
	}

	const stdout = await gitExec(gitDir, "worktree list --porcelain");
	const worktrees: WorktreeInfo[] = [];
	let current: Partial<WorktreeInfo> = {};

	for (const line of stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current.path) worktrees.push(current as WorktreeInfo);
			current = { path: line.slice(9) };
		} else if (line.startsWith("HEAD ")) {
			current.head = line.slice(5);
		} else if (line.startsWith("branch ")) {
			current.branch = line.slice(7).replace("refs/heads/", "");
		} else if (line === "bare") {
			current = {};
		} else if (line === "") {
			if (current.path) worktrees.push(current as WorktreeInfo);
			current = {};
		}
	}

	setCache(key, worktrees, 30_000);
	return worktrees;
}

export async function getWorktreeDetail(wtPath: string): Promise<WorktreeDetail> {
	const key = `detail:${wtPath}`;
	const cached = getCached<WorktreeDetail>(key);
	if (cached && !isStale(key)) return cached;
	if (cached) {
		refreshWorktreeDetail(wtPath, cached);
		return cached;
	}
	return refreshWorktreeDetail(wtPath, null);
}

async function refreshWorktreeDetail(wtPath: string, existing: WorktreeDetail | null): Promise<WorktreeDetail> {
	const key = `detail:${wtPath}`;

	const [statusOut, logOut, branchOut, headOut] = await Promise.all([
		gitExec(wtPath, "status --porcelain"),
		gitExec(wtPath, 'log -10 --format="%h|||%s|||%ar"'),
		gitExec(wtPath, "rev-parse --abbrev-ref HEAD"),
		gitExec(wtPath, "rev-parse --short HEAD"),
	]);

	const statusLines = statusOut.split("\n").filter((l) => l.length > 0);
	const changedFiles = statusLines.slice(0, 30).map((l) => ({
		status: l.slice(0, 2).trim(),
		file: l.slice(3),
	}));

	const recentCommits = logOut
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [hash, message, ago] = l.split("|||");
			return { hash, message, ago };
		});

	// ahead/behind — these can be slow if no upstream, don't block
	let ahead = existing?.ahead ?? 0;
	let behind = existing?.behind ?? 0;
	try {
		const aOut = await gitExec(wtPath, "rev-list --count @{u}..HEAD");
		ahead = parseInt(aOut.trim(), 10) || 0;
		const bOut = await gitExec(wtPath, "rev-list --count HEAD..@{u}");
		behind = parseInt(bOut.trim(), 10) || 0;
	} catch {
		// no upstream or network issue, keep previous values
	}

	const detail: WorktreeDetail = {
		path: wtPath,
		branch: branchOut.trim() || null,
		head: headOut.trim() || null,
		dirty: statusLines.length > 0,
		dirtyCount: statusLines.length,
		changedFiles,
		recentCommits,
		ahead,
		behind,
	};

	setCache(key, detail, 5_000);
	return detail;
}

export function invalidateWorktreeCache(wtPath: string) {
	cache.delete(`detail:${wtPath}`);
}
