---
name: diff
description: Use when the user asks to explain, review, summarize, or walk through code changes, a PR, branch, git diff, patch, or specific modified files and wants syntax-highlighted code snippets with annotations instead of raw unified diff syntax.
---

# Diff

## Overview

Explain code changes by showing the relevant before/after code snippets in syntax-highlighted blocks and annotating what each change does. Prefer concrete code over prose-only summaries.

## Workflow

1. Identify the diff scope: current worktree, `origin/...HEAD`, a PR, a commit range, or specific files. If the scope is ambiguous, infer from the current repo and branch, then state the assumption briefly.
2. Inspect the actual diff before explaining it. Use `git diff --stat`, `git diff --name-status`, and targeted `git diff` or file reads as needed.
3. Group related changes by runtime path or subsystem, not by incidental file order, while still accounting for every changed file.
4. For each meaningful change, include syntax-highlighted code snippets using the file's language, not raw unified diff fences.
5. Annotate each snippet immediately after it with what changed, why it matters, and any behavior or risk.
6. For repeated mechanical changes, show one representative snippet and list the files that share the same pattern.
7. For generated, lockfile, binary, or vendor artifacts, do not paste large contents. State what changed and why it is present.
8. End with a compact summary of the overall behavior change and any files left uncommitted or out of PR scope.

## Output Style

- Do not use raw `diff` code fences unless the user explicitly asks for unified diff syntax.
- Use language-specific fences such as `ts`, `tsx`, `js`, `json`, `yaml`, `dockerfile`, or `sql`.
- Prefer before/after snippets when the change is subtle. Use one snippet plus annotation when the new code is enough.
- Keep snippets short and targeted; omit unchanged surrounding code unless it is needed for understanding.
- Use direct file links with line numbers when referencing local files.
- Make annotations plain and specific: "This persists Pi compaction artifacts before replay" is better than "Refactors compaction."
- Separate behavior changes from comments, docs, tests, and package-manager artifacts.
- If the diff is too large to fully render in one response, say which groups are covered and continue in follow-up chunks rather than compressing away important code.
