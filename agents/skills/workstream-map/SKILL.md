---
name: workstream-map
description: Analyze Slack DMs, open PRs, and git worktrees to produce a prioritized workstream map
user_invocable: true
---

# /workstream-map

Generate a comprehensive workstream map by gathering data from Slack, GitHub, and local git worktrees. Output a timestamped markdown file to the Desktop.

## Step 1: Identify Key People

Search Slack for DM channels with leadership (CEO, CTO, and any other key collaborators). Use `users_search` and `channels_list` as needed. If the user specifies names, use those. Otherwise, default to recent DM partners.

## Step 2: Read Slack DMs

For each key person, read the last 30 days of DM history using `conversations_history`. Extract:

- Active projects and workstreams discussed
- Commitments made (by the user and by others)
- Blockers and concerns raised
- Strategic priorities and urgency signals
- Requests made of the user
- Relationship dynamics (how they treat the user, what they rely on the user for)

## Step 3: Search Slack Channels

Search relevant channels (#dev, #general, and any project-specific channels) for the user's recent messages to find:

- Work posted/shared publicly
- Things flagged for others
- Threads with active discussion

## Step 4: Get Open PRs

Use `gh pr list --author <username> --repo <org/repo> --state open` to find all open PRs. Note how old each one is.

## Step 5: Map Git Worktrees

Run `git worktree list` in the user's repo directory (look in `~/dev/` or ask). For each worktree:

1. Check if the branch exists on remote (`git branch -r --list "origin/<branch>"`)
2. Check ahead/behind status vs remote
3. Check for uncommitted files (`git status --porcelain`)
4. Find associated PR (`gh pr list --head <branch> --state all`)
5. Categorize each worktree as:
   - **Active** (has open PR)
   - **WIP** (no PR, has uncommitted work)
   - **Dead** (PR already merged — candidate for cleanup)
   - **Stale** (no PR, no uncommitted work, not on remote)

Flag warnings for:
- Uncommitted work that hasn't been pushed (data loss risk)
- Branches far behind main (painful merge ahead)
- Old open PRs (aging work)
- Dead worktrees cluttering the workspace

## Step 6: Compile the Workstream Map

Organize everything into a markdown file with these sections:

### Current Workstreams
Group all in-flight work by theme/project. For each item, note:
- Status (done / open PR / WIP / not started / stuck / blocked)
- PR number if applicable
- Who cares about it (which stakeholders mentioned it)

### Worktree Status
Tables showing active, WIP, and dead worktrees with their remote sync status, dirty files, and associated PRs.

### Priority Tiers
Rank all work into 4 tiers:
- **Tier 1: Close out NOW** — almost done, high impact, aging
- **Tier 2: High leverage** — what multiple stakeholders need most
- **Tier 3: Important but can wait** — real value, not urgent
- **Tier 4: Delegate or drop** — someone else can do it or it doesn't matter right now

### This Week
A concrete day-by-day plan for the current week based on the priorities.

### Key Relationships
For each key person, summarize:
- How they treat the user
- What they rely on the user for
- What they care about most right now
- Any signals to watch

## Step 7: Write the File

Save to `~/Desktop/workstream-map-<YYYY-MM-DD>.md` using today's date.

## Important

- Be honest and direct in assessments. Don't sugarcoat.
- Flag overextension if the user has too many things in flight.
- Distinguish between "talked about" and "actually in progress."
- Note things that are local-only and at risk of data loss.
- The goal is clarity and focus, not a comprehensive task dump.
