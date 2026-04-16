---
name: standup
description: Compile a standup update from recently merged PRs
user_invocable: true
---

# /standup

Compile a standup update by:

1. Get the GitHub username via `gh api user`
2. Determine the time window. The user is in PST (UTC-8). The window covers **yesterday 00:00 PST through the current minute today**. Convert yesterday 00:00 PST to UTC for the `--merged-at` query (i.e. yesterday 08:00 UTC).
3. Search for PRs in that window:
   - Authored by the user: `gh search prs --author=<username> --merged --merged-at="<yesterday>.."`
   - Involved (reviewed/merged by user, including `create-inc-service-account` PRs): `gh search prs --merged --merged-at="<yesterday>.." --involves=<username>`
   - Deduplicate results across both queries.
4. Fetch PR bodies with `gh pr view` for each PR to get context
5. Compile a concise standup summary grouped by theme, not individual PRs. Mention PR numbers inline as references. Keep it short — a few bullet points, not a wall of text.
