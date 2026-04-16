---
name: pr-review
description: Review a GitHub PR with inline comments and submit as a formal review
argument-hint: <github-pr-url> [--here]
allowed-tools: Bash(gh *)
---

Review the GitHub pull request at the URL provided in `$ARGUMENTS`. Use `gh` CLI to fetch the PR metadata, diff, and full file contents for changed files. Read enough context to understand the changes thoroughly before reviewing.

If `$ARGUMENTS` contains `--here`, output the review directly in the conversation instead of posting it to GitHub (see "Posting the review" below). Otherwise, post it as a formal GitHub review.

## Style Guide

### What to look for

1. **Named parameters** — Functions must use object destructuring, not positional args. Exception: single-arg functions or well-known APIs.
2. **No typecasting** — Never use `as` assertions or `as unknown as`. Fix the types instead. `satisfies` is fine.
3. **No duplicate logic** — If the same pattern appears twice, extract it. DRY.
4. **Proper abstraction layers** — Data access goes through data loaders/resolvers, not raw DB queries in business logic. Don't reach across layers.
5. **Don't export internals** — If something is only used inside a module, don't export it.
6. **New integrations need tests** — Adding a new service integration, API endpoint, or resolver without tests gets flagged.
7. **Feature flagging** — New features must be behind a feature flag.
8. **Tests** — Ensure complex logic has proper testing. Do not require pedantic tests for simple functions, but flag truly untested complex code.
9. **Call-site impact** — Explore call sites of changed code. Does this introduce bugs to existing features? Does new code need to be used in other places?

### Additional checks

- **No `any` types** — Use `unknown` and narrow, or define proper types.
- **No optional params** — Prefer `param: string | null` over `param?: string`.
- **No boolean params** — Use an enum or options object instead.
- **Guard clauses** — Return early instead of deep nesting.
- **Error handling** — Use `neverthrow` (Result types) over try/catch where possible.
- **Barrel files** — Do not introduce barrel files (index.ts that re-exports).

### What to ignore

- **Formatting** — Biome handles this. Do not comment on whitespace, semicolons, trailing commas, or import ordering.
- **Minor naming** — Don't bikeshed variable names unless truly misleading.
- **Pre-existing issues** — Only comment on lines in this PR's diff. Do not flag old code.
- **Infrastructure files** — Skip terraform, Dockerfiles, CI configs unless there's a clear bug.
- **Test file style** — Tests can be more relaxed on structure. Focus on whether they actually test the right things.

### Tone

- **Direct and brief.** "do not cast" not "Perhaps we could consider not using type assertions here."
- **Imperative.** "extract this into a helper" not "It might be beneficial to extract this."
- Prefix purely optional observations with `nit:`.
- If something is good, don't comment on it. Only comment on things that need to change or are worth noting.
- **Do not be sycophantic or apologetic. No "Great work overall!", "Solid PR!", or similar filler.**

### Review format

- **Maximum 10 inline comments** per review. Focus on the most important issues.
- Each comment should be on a specific line in the diff.
- If everything looks fine, approve with a short message like "lgtm" or "lgtm, clean PR".
- Use `REQUEST_CHANGES` only for blocking issues (items 1-5 above). Use `COMMENT` for non-blocking observations.
- Group related feedback into a single comment when possible.

## Phase 4: Post Review

**If `--here` was passed**, skip the GitHub API call entirely. Instead, output the review in the conversation using this format:

```
**Verdict**: APPROVE | COMMENT | REQUEST_CHANGES

[One-line summary if needed]

- **path/to/file.ts:42** — comment text
- **path/to/file.ts:87** — comment text
```

**Otherwise**, post the review using the GitHub API:

For reviews with multiple inline comments, write the JSON payload to a file:

```bash
echo '{
  "event": "COMMENT",
  "body": "Review summary",
  "comments": [
    {"path": "file.ts", "line": 42, "body": "comment text"}
  ]
}' > /tmp/review.json
gh api "repos/{owner}/{repo}/pulls/{number}/reviews" \
  --method POST \
  --input /tmp/review.json
```

- Use `REQUEST_CHANGES` only for blocking issues.
- Use `COMMENT` when not qualified to judge or issues are non-blocking.
- Use `APPROVE` with a short body if everything looks good or issues are minor.
- The `line` field must refer to a line number in the diff's new file (right side). Only comment on lines that appear in the diff.
- The `path` must be relative to the repo root.

## Important

- If the PR is trivial (only formatting, deps, CI config), approve with a short message.
- Focus on substance over style. Biome handles formatting.
- You are reviewing as a helpful colleague, not a gatekeeper.
- Push the pace of shipping while maintaining quality. Avoid architectural tar pits and bikeshedding, but ensure codebase quality doesn't degrade.
