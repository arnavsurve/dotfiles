---
name: ship
description: "Drive a PR to merge: arm auto-merge, monitor CI, root-cause failures, resolve conflicts with upstream, and push fixes until it lands. Use when the user wants a PR shepherded across the finish line, or after they've finished review-comment work and just want it merged. Works from a PR URL or the current branch's PR."
argument-hint: "[<github-pr-url>]"
allowed-tools: "Bash(gh *), Bash(git *), Bash(rg *), Bash(yarn *), Bash(npm *)"
user_invocable: true
---

Shepherd the PR in `$ARGUMENTS` (or the PR for the current branch) through to merge. Keep auto-merge armed, watch CI, fix what breaks, resolve upstream conflicts, and only stop when the PR is merged or genuinely blocked on a human action you cannot resolve.

## Workflow

1. **Identify the PR.** Use the URL when present. Otherwise `gh pr view --json number,url,baseRefName,headRefName,autoMergeRequest,mergeable,mergeStateStatus,reviewDecision`.
2. **Arm auto-merge** if not already set. Default to `squash` unless the repo's convention says otherwise (check recent merges with `git log --oneline origin/<base> -5`). Command: `gh pr merge <num> --auto --squash`.
3. **Pull the current state**: `gh pr view <num> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup` plus `gh pr checks <num>` for human-readable status.
4. **Decide what to do** based on the state — see Decision Rules below.
5. **Loop**: after any push, sleep with `ScheduleWakeup` (don't rapid-poll). When CI completes, re-evaluate. When the PR merges, confirm and stop. When blocked on human action, surface clearly to the user and stop.

## Decision Rules

For each combination of state, do the matching thing:

- **Merged** → done. Tell the user the merge SHA. Stop.
- **All checks passing + reviewDecision: APPROVED + auto-merge armed** → wait for the merge to fire. Sleep ~120-300s and re-check.
- **CI in progress** → sleep based on the longest-running check's typical duration. For builds that take 5-10 min, sleep 270s (stay in cache); for longer, sleep 1200-1800s. Don't poll under 60s.
- **CI failing** → root-cause the failure and fix it. See "Fixing failures" below.
- **mergeStateStatus: BEHIND** → rebase or merge upstream. Conflicts → see "Resolving conflicts" below.
- **mergeStateStatus: BLOCKED + reviewDecision empty/REVIEW_REQUIRED** → review approval is stale or missing. Surface to the user with a specific ask ("PR needs fresh approval on `<sha>` — last approval was on `<earlier-sha>`"). Stop.
- **mergeStateStatus: BLOCKED + checks all green + reviewDecision: APPROVED** → there's a branch protection rule you can't see. Run `gh api repos/<owner>/<repo>/branches/<base>/protection` if visible; otherwise surface the unknown blocker to the user and stop.
- **Draft** → ask the user before marking ready.

## Fixing Failures

Don't retry blindly — read the failed job's logs first.

- `gh pr checks <num>` lists failures with URLs.
- `gh run view <run-id> --log-failed` (or `--log` for the whole run) pulls the failed step output. For job-level detail, `gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure")'` gives job IDs.
- Identify the root cause from the log. Common patterns:
    - Lint/format/typecheck → run the same command locally, fix, push.
    - Test failures → reproduce locally with the exact command from the workflow.
    - Env / secret missing → check if a new env var needs `passThroughEnv` in `turbo.json`, a Doppler secret, or a Vercel env entry.
    - Infrastructure flake (network, registry, runner) → re-run only after confirming it's not your code: `gh run rerun <run-id> --failed`.

After pushing a fix, sleep and re-check. If the same check fails again with a different reason, that's expected progress — keep iterating. If it fails the same way, you misdiagnosed; re-read the log.

## Resolving Conflicts

When the PR is behind and has conflicts:

- **Never blindly pick one side.** Read both versions and the common ancestor (`git merge-tree --write-tree HEAD <base>` or look at the diff3 markers).
- For refactors on the upstream side, the upstream version usually wins (their refactor invalidates your version). For your in-flight feature work, your side usually wins. When in doubt, look at what the surrounding code expects and pick the version that's consistent.
- Drop conflict markers; verify nothing references symbols that no longer exist on the chosen side.
- Run `typecheck` (or the equivalent) on the touched packages immediately after resolving. Don't push until green locally.
- Commit the merge with the default message; don't squash the merge into your prior commit.

## Hard Rules

- **Never `--no-verify`, `--no-gpg-sign`, or `git push --force`** unless the user explicitly asks. Hook failures are real signal — diagnose them.
- **Never disable a failing check** to make the PR mergeable.
- **Never amend a published commit** to "fix" CI. Push a new commit.
- **Never poll faster than 60s.** The Anthropic prompt cache has a 5-minute TTL; sleeping ~270s keeps it warm, sleeping 1200-1800s amortizes the miss for genuinely idle waits. Don't pick 300s.
- **Don't keep iterating forever.** If you've pushed 3 fixes for the same failure and it's still red, stop and surface to the user — you've misdiagnosed.
- **Don't ignore unstaged debug-only changes** the user previously kept out of commits. Stash them around merge / rebase operations and restore.

## When To Stop

You're done when one of these is true:

- The PR is merged.
- The blocker is human action you cannot take (fresh approval, design decision, missing secret only the user can rotate).
- You've hit the iteration cap on a single failure mode.

Never silently stop. Always close with a clear status message: "merged at `<sha>`" or "blocked on `<specific human ask>`."

## Sleep Cadence

Use `ScheduleWakeup` with the same `/loop` prompt (or `<<autonomous-loop-dynamic>>` sentinel). Picking the delay:

- Just pushed and CI takes ~5 min → 270s.
- Just pushed and CI takes 10-15 min → 1200s.
- Waiting on a known long pipeline (~30 min) → 1800s.
- Idle "I think auto-merge will fire any second" → 120s, twice, then escalate to surfacing.

Match the wakeup to what you're actually waiting for, not a round number of minutes.
