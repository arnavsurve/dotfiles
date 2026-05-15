---
name: marcus
description: "Assess a PR for code quality, codebase standards, DRY, and review/merge readiness. Cross-references marcusglowe's past PR reviews to surface things he is likely to flag. Works from a PR URL or the current branch's PR."
argument-hint: "[<github-pr-url>]"
allowed-tools: "Bash(gh *), Bash(git *), Bash(rg *), Bash(jq *), Bash(sed *)"
user_invocable: true
---

Assess the PR in `$ARGUMENTS` for code quality, codebase standards, DRY, and whether it's ready for review/merge. If no PR URL is provided, use the PR for the current branch.

## Workflow

1. Identify the PR. Use the provided URL when present; otherwise `gh pr view --json url,number,headRefName,baseRefName,title,body,files,additions,deletions`.
2. Fetch the diff: `gh pr diff <pr>`. Read the full diff, then open the changed files for surrounding context — don't review hunks in isolation.
3. Pull marcusglowe's recent review signal (see below) to learn what he tends to flag in this repo. Use the patterns to sharpen your own pass — don't just parrot his style.
4. Walk the diff with these lenses, in order:
   - **Correctness**: bugs, broken edge cases, error handling gaps, race conditions, missing null/empty handling.
   - **Codebase standards**: does this match existing conventions in neighboring files? Naming, file layout, import order, test structure, log/metric patterns.
   - **DRY**: is there an existing helper/util/component that already does this? Grep for similar logic before accepting a new implementation. Flag copy-pasted blocks.
   - **Quality**: readability, dead code, unnecessary abstractions, premature generalization, comments that restate code, leftover TODOs/console logs.
   - **Tests**: is the new behavior actually tested? Are tests meaningful or just coverage theater?
   - **Scope**: drive-by changes unrelated to the PR's stated purpose.
5. Produce the report (format below). Be specific — file:line references, not vague categories.

## Pulling marcusglowe's review patterns

Use this to learn what marcus typically flags in this repo, then apply that lens to the current PR. Don't just list his past comments — synthesize the recurring patterns.

```bash
# Resolve repo owner/name from current PR context
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

# Recent PRs marcusglowe has reviewed in this repo
gh search prs --repo="$OWNER/$REPO" --reviewed-by=marcusglowe --limit=20 --json number,title,url

# For the most relevant ~5-10, pull his actual review comments
gh api "repos/$OWNER/$REPO/pulls/<num>/comments" \
  --jq '.[] | select(.user.login=="marcusglowe") | {path, line, body}'
```

Look for recurring themes: naming conventions he pushes on, abstractions he dislikes, test patterns he requires, error-handling style, "we already have a helper for this" callouts. Those become the extra lens for *this* PR.

If marcusglowe has not reviewed PRs in this repo, say so and proceed with the generic lenses only.

## Report Format

```text
**PR**: <url> — <title>
**Verdict**: ready to merge | ready for review | needs changes before review

**Marcus patterns observed in this repo**:
- <pattern 1 — one line>
- <pattern 2 — one line>
(or: "marcusglowe has not reviewed PRs in this repo")

**Likely flags**:
- path:line — <what marcus would probably call out and why>

**Other issues**:
- **correctness** — path:line — <issue>
- **standards** — path:line — <issue>
- **DRY** — path:line — <existing helper at other/path that already does this>
- **quality** — path:line — <issue>
- **tests** — <gap>
- **scope** — path:line — <unrelated change>

**Strengths**:
- <what's done well — keep this short>
```

## Rules

- Don't post anything to GitHub. This is a read-only assessment for the user.
- Cite specific file:line for every flag. No vague "consider refactoring this area".
- For DRY flags, actually find the existing helper (grep) before claiming duplication.
- If the PR is small and clean, say so plainly. Don't manufacture issues.
- If marcus's review history suggests a strong preference and the PR violates it, call that out explicitly under "Likely flags".
