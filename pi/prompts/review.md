---
description: "Review code: unstaged | staged | branch | pr | pr-post"
---
Review code with mode: **$1**

Depending on the mode, follow the corresponding instructions:

## Mode: `unstaged`
Review only unstaged changes (`git diff`). Focus on bugs, logic errors, security issues, error handling gaps, and style problems. Summarize findings concisely.

## Mode: `staged`
Review only staged changes (`git diff --cached`). Focus on bugs, logic errors, security issues, error handling gaps, and style problems. Summarize findings concisely.

## Mode: `branch`
Review the full implementation on this branch compared to the base branch. Use `git log --oneline main..HEAD` and `git diff main...HEAD` (or the appropriate base branch) to understand the scope. Provide a holistic review covering architecture, correctness, error handling, naming, test coverage, and any loose ends or TODOs.

## Mode: `pr`
Review the open PR for the current branch. Use `gh pr view` to get the PR details and `gh pr diff` to get the changes. Review the full diff like a thorough code reviewer — architecture, correctness, edge cases, naming, test coverage. Summarize findings in chat.

## Mode: `pr-post`
Review the open PR for the current branch. Use `gh pr view` to get the PR details and `gh pr diff` to get the changes. Write a thorough review, then post it using `gh pr review` with appropriate flags (`--comment`, `--approve`, or `--request-changes`) and a well-structured review body. Ask me which action to take before posting.

---

If no mode is provided or the mode is unrecognized, list the available modes and ask which one to use.
