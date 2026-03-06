---
description: "Review code: unstaged | staged | branch | pr | pr-post"
---
Review code with mode: **$1** $2

Depending on the mode, follow the corresponding instructions:

## Mode: `unstaged`
Review only unstaged changes (`git diff`). Focus on bugs, logic errors, security issues, error handling gaps, and style problems. Summarize findings concisely.

## Mode: `staged`
Review only staged changes (`git diff --cached`). Focus on bugs, logic errors, security issues, error handling gaps, and style problems. Summarize findings concisely.

## Mode: `branch`
Review the full implementation on this branch compared to the base branch. Use `git log --oneline main..HEAD` and `git diff main...HEAD` (or the appropriate base branch) to understand the scope. Provide a holistic review covering architecture, correctness, error handling, naming, test coverage, and any loose ends or TODOs.

## Mode: `pr`
Review a PR. If a PR URL is provided as the second argument, use that (e.g. `gh pr view <url>`, `gh pr diff <url>`). Otherwise, use the open PR for the current branch (`gh pr view`, `gh pr diff`). Review the full diff like a thorough code reviewer — architecture, correctness, edge cases, naming, test coverage. Summarize findings in chat.

## Mode: `pr-post`
Review a PR and post the review. If a PR URL is provided as the second argument, use that (e.g. `gh pr view <url>`, `gh pr diff <url>`, `gh pr review <url>`). Otherwise, use the open PR for the current branch. Write a thorough review, then post it using `gh pr review` with appropriate flags (`--comment`, `--approve`, or `--request-changes`) and a well-structured review body. Ask me which action to take before posting.

---

## General guidelines

- Don't bikeshed. Ignore stylistic nitpicks, subjective naming preferences, or trivial formatting unless it genuinely hurts readability. Focus on things that matter: correctness, security, performance, maintainability.
- If something is fine but you'd do it differently, skip it. Only flag issues you'd actually block a PR on.

---

If no mode is provided or the mode is unrecognized, list the available modes and ask which one to use.
