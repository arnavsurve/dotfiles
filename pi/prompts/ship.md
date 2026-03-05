---
description: Commit, push, and open a PR
---
Look at all uncommitted changes (staged and unstaged). Group them into logical commits by related files/concerns. For each logical group:

1. Stage the relevant files
2. Write a concise, conventional commit message (e.g. `fix:`, `feat:`, `chore:`, `refactor:`)

After all commits are made, push the branch and open a PR. Use the commit messages to inform the PR title and body. If there's only one commit, use it as the PR title. If multiple, write a summary title and list the commits in the body.

Use `gh pr create` to open the PR. If the branch has no upstream, push with `-u origin HEAD`.
