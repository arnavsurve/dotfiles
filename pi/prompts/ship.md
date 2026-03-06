---
description: "Commit and ship: push | pr"
---
Ship with mode: **$1**

Look at all uncommitted changes (staged and unstaged). Group them into logical commits by related files/concerns. For each logical group:

1. Stage the relevant files
2. Write a concise, conventional commit message (e.g. `fix:`, `feat:`, `chore:`, `refactor:`)

After all commits are made, push the branch. If the branch has no upstream, push with `-u origin HEAD`.

## Mode: `push`
Stop here — do not create a PR.

## Mode: `pr`
Open a PR. Use the commit messages to inform the PR title and body. If there's only one commit, use it as the PR title. If multiple, write a summary title and list the commits in the body. Use `gh pr create` to open the PR.

---

If no mode is provided or the mode is unrecognized, default to `push`.
