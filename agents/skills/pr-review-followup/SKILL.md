---
name: pr-review-followup
description: "Address GitHub PR review comments after a draft PR is up. Use when the user asks to respond to inline PR comments, apply requested review changes, resolve review threads, or reply on GitHub with rationale or discussion instead of changing code. Works from a PR URL or the current branch's PR."
argument-hint: "[<github-pr-url>] [--here]"
allowed-tools: "Bash(gh *), Bash(git *), Bash(rg *), Bash(sed *)"
user_invocable: true
---

Address the unresolved review threads on the PR provided in `$ARGUMENTS`. If no PR URL is provided, use the PR for the current branch.

If `$ARGUMENTS` contains `--here`, do not post to GitHub. Output the proposed code changes, replies, and which threads would be resolved.

## Workflow

1. Identify the PR. Use the provided URL when present. Otherwise run `gh pr view` from the repo root.
2. Fetch unresolved review threads with GraphQL. Ignore resolved threads unless the user explicitly asks to revisit them.
3. For each thread, read the whole thread, the diff hunk, and the surrounding file context before acting.
4. Decide between:
   - **Change + resolve**: implement the requested change, run focused validation, reply with what changed, then resolve the thread.
   - **Reply only**: if the right action is explanation, tradeoff discussion, or respectful pushback, reply with rationale and leave the thread unresolved.
5. If several threads are fixed by the same code change, implement the change once and reply on each relevant thread separately.
6. Summarize what changed, which threads were resolved, which only got replies, and any threads left open.

## Decision Rules

- Prefer changing code when the reviewer found a concrete bug, correctness issue, edge case, missing test, or clear readability problem.
- Reply instead of changing code when the comment is a question, a preference you reasonably disagree with, or a request that conflicts with local constraints.
- Do not resolve a thread after a reply-only response. Resolve only after the code and reply make the concern moot, or the user explicitly asks to force-resolve it.
- Do not post speculative replies. Inspect the code first.
- Keep replies brief and specific. State what changed, or the reasoning for not changing it.
- If a thread is outdated, verify whether the concern is already fixed in the current branch before replying. If it is already fixed, say so and resolve it.
- If several comments point at the same underlying problem, make the code change once and tailor the replies to each thread.

## Fetching Review Threads

Use `gh api graphql` so you can access thread ids and resolution state.

```bash
gh api graphql -F owner=OWNER -F name=REPO -F number=PR_NUMBER -f query='
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      number
      url
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 20) {
            nodes {
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}'
```

Paginate until `hasNextPage` is false. Work from unresolved threads first.

## Posting Replies

Reply on the thread with GraphQL:

```bash
gh api graphql -F threadId="$THREAD_ID" -f body="$BODY" -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: { pullRequestReviewThreadId: $threadId, body: $body }
  ) {
    comment { url }
  }
}'
```

Resolve a thread only after the code is in the branch and you have posted the reply:

```bash
gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}'
```

## Reply Style

- No filler.
- For change threads, prefer: `fixed in <short description>.`
- For explanation threads, prefer: `keeping this as-is because ...`
- Mention tests only if you actually ran them.

## `--here` Output

When `--here` is present, output:

```text
**PR**: <url>
**Tests**: <what you ran or "not run">

- **change + resolve** — path:line — proposed reply
- **reply only** — path:line — proposed reply
- **left open** — reason
```

If there are no unresolved review threads, say so explicitly.
