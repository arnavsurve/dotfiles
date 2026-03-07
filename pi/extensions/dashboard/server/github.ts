/**
 * GitHub PR data via GraphQL with caching.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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

async function graphql(query: string, variables: Record<string, unknown> = {}): Promise<any> {
	const token = await getToken();
	if (!token) return null;

	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!res.ok) return null;
	const json = await res.json();
	return json.data ?? null;
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
}

const prCaches = new Map<string, PRCache>();
const PR_TTL = 30_000;

export async function getMyPRs(repoFullName: string): Promise<PullRequest[]> {
	const cached = prCaches.get(repoFullName);
	if (cached && Date.now() - cached.fetchedAt < PR_TTL) return cached.prs;

	if (cached) {
		refreshPRs(repoFullName);
		return cached.prs;
	}

	return refreshPRs(repoFullName);
}

const PR_QUERY = `
query($owner: String!, $repo: String!) {
  viewer {
    login
  }
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: 30, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number
        title
        url
        headRefName
        isDraft
        additions
        deletions
        createdAt
        reviewDecision
        author {
          login
        }
      }
    }
  }
}
`;

const BRANCH_PR_QUERY = `
query($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(headRefName: $branch, first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number
        state
        merged
        mergedAt
        closedAt
        url
        title
      }
    }
  }
}
`;

export interface BranchPRStatus {
	number: number;
	state: "OPEN" | "CLOSED" | "MERGED";
	merged: boolean;
	mergedAt: string | null;
	closedAt: string | null;
	url: string;
	title: string;
}

const branchPRCache = new Map<string, { status: BranchPRStatus | null; fetchedAt: number }>();

export async function getBranchPRStatus(repoFullName: string, branch: string): Promise<BranchPRStatus | null> {
	const key = `${repoFullName}:${branch}`;
	const cached = branchPRCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < PR_TTL) return cached.status;

	const [owner, repo] = repoFullName.split("/");
	if (!owner || !repo) return null;

	try {
		const data = await graphql(BRANCH_PR_QUERY, { owner, repo, branch });
		if (!data) return cached?.status ?? null;

		const node = data.repository.pullRequests.nodes[0];
		const status: BranchPRStatus | null = node
			? {
				number: node.number,
				state: node.merged ? "MERGED" : node.state,
				merged: node.merged,
				mergedAt: node.mergedAt,
				closedAt: node.closedAt,
				url: node.url,
				title: node.title,
			}
			: null;

		branchPRCache.set(key, { status, fetchedAt: Date.now() });
		return status;
	} catch {
		return cached?.status ?? null;
	}
}

async function refreshPRs(repoFullName: string): Promise<PullRequest[]> {
	const [owner, repo] = repoFullName.split("/");
	if (!owner || !repo) return [];

	try {
		const data = await graphql(PR_QUERY, { owner, repo });
		if (!data) return prCaches.get(repoFullName)?.prs ?? [];

		const login = data.viewer.login;
		const nodes = data.repository.pullRequests.nodes;

		const myPrs: PullRequest[] = nodes
			.filter((pr: any) => pr.author?.login === login)
			.map((pr: any) => ({
				number: pr.number,
				title: pr.title,
				url: pr.url,
				branch: pr.headRefName,
				repo,
				repoFullName,
				reviewDecision: pr.reviewDecision,
				additions: pr.additions,
				deletions: pr.deletions,
				createdAt: pr.createdAt,
				draft: pr.isDraft,
			}));

		prCaches.set(repoFullName, { prs: myPrs, fetchedAt: Date.now() });
		return myPrs;
	} catch {
		return prCaches.get(repoFullName)?.prs ?? [];
	}
}

export async function getRepoFullName(repoRoot: string): Promise<string | null> {
	try {
		const { stdout } = await execAsync(`git -C "${repoRoot}" remote get-url origin`, { timeout: 3000 });
		const url = stdout.trim();
		const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}
