/**
 * GitHub PR data via Octokit with conditional caching.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let octokitInstance: any = null;
let tokenCache: string | null = null;

async function getToken(): Promise<string | null> {
	if (tokenCache) return tokenCache;
	try {
		const { stdout } = await execAsync("gh auth token", { timeout: 3000 });
		tokenCache = stdout.trim() || null;
		return tokenCache;
	} catch {
		return null;
	}
}

async function getOctokit() {
	if (octokitInstance) return octokitInstance;
	const token = await getToken();
	if (!token) return null;

	const { Octokit } = await import("@octokit/rest");
	octokitInstance = new Octokit({ auth: token });
	return octokitInstance;
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

interface PRCache {
	prs: PullRequest[];
	fetchedAt: number;
	etag: string | null;
}

const prCaches = new Map<string, PRCache>();
const PR_TTL = 30_000;

export async function getMyPRs(repoFullName: string): Promise<PullRequest[]> {
	const cached = prCaches.get(repoFullName);
	if (cached && Date.now() - cached.fetchedAt < PR_TTL) return cached.prs;

	// stale-while-revalidate
	if (cached) {
		refreshPRs(repoFullName);
		return cached.prs;
	}

	return refreshPRs(repoFullName);
}

async function refreshPRs(repoFullName: string): Promise<PullRequest[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	const [owner, repo] = repoFullName.split("/");
	if (!owner || !repo) return [];

	try {
		const { data: user } = await octokit.users.getAuthenticated();
		const { data: prs } = await octokit.pulls.list({
			owner,
			repo,
			state: "open",
			per_page: 30,
		});

		const myPrs = prs
			.filter((pr: any) => pr.user?.login === user.login)
			.map((pr: any) => ({
				number: pr.number,
				title: pr.title,
				url: pr.html_url,
				branch: pr.head.ref,
				repo: repo,
				repoFullName,
				reviewDecision: null, // would need GraphQL for this
				additions: pr.additions,
				deletions: pr.deletions,
				createdAt: pr.created_at,
				draft: pr.draft ?? false,
			}));

		prCaches.set(repoFullName, { prs: myPrs, fetchedAt: Date.now(), etag: null });
		return myPrs;
	} catch {
		return prCaches.get(repoFullName)?.prs ?? [];
	}
}

/**
 * Discover the GitHub remote for a repo by running `git remote get-url origin`.
 * Returns "owner/repo" or null.
 */
export async function getRepoFullName(repoRoot: string): Promise<string | null> {
	try {
		const { stdout } = await execAsync(`git -C "${repoRoot}" remote get-url origin`, { timeout: 3000 });
		const url = stdout.trim();
		// handle both SSH and HTTPS
		const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}
