---
name: viz
description: "Read-only investigation of a topic in the current codebase. Use when the user wants to understand how something works (e.g. \"look into our db handling\", \"are we using rds proxy?\", \"how does auth flow work?\") and explicitly does NOT want changes — just visibility. Output is filenames, line numbers, and code snippets."
argument-hint: "<topic or question>"
user_invocable: true
---

# /viz

Investigate `$ARGUMENTS` in the current codebase. **Read-only.** Do not edit, write, or stage any files. Do not run migrations, deploys, or anything that mutates state.

The user wants visibility, not action. The deliverable is a grounded picture of how the code actually works today, with citations.

## Workflow

1. Scope the question. Restate the topic in one line so the user can correct you if you're investigating the wrong thing. If the request is broad ("look into our db handling"), pick the 2–4 most useful angles to cover (e.g. connection setup, pooling, retries, transaction boundaries) and say which ones you'll look at.
2. Search the repo. Use `rg` / `find` / Explore agent for breadth. Read full files when the snippet alone won't tell the story.
3. Verify before claiming. If you say "we don't use X" or "there is no Y", confirm by searching for the obvious names, package imports, and config keys before stating it. Absence claims are easy to get wrong.
4. Report findings.

## Output format

Lead with a 1–3 sentence answer to the user's question. Then a **Findings** section with concrete citations, then **Gaps / unknowns** if anything couldn't be confirmed read-only.

Every claim about the code must cite `path/to/file.ext:line` and include a short snippet (3–10 lines) showing the relevant code. No claim without a citation. No citation without a snippet.

### Spacing — this matters

Terminal markdown renderers collapse adjacent bullets and code fences into an unreadable wall. To prevent that:

- **One blank line between every finding bullet.** Never let two bullets touch.
- **One blank line before and after every fenced code block.** Including between the bullet's claim line and the opening fence.
- **Do not indent code fences inside bullets.** Put the fence at column 0, even though it's "under" the bullet — indented fences render inconsistently and many renderers eat the language tag.
- **Always include a language tag** on the opening fence (`` ```ts ``, `` ```python ``, `` ```yaml ``, `` ```text `` if unsure).

### Template

Follow this layout exactly. Note the blank lines.

````text
**Question**: <one-line restatement>

**Answer**: <1–3 sentences>

**Findings**

- <claim> — `path/to/file.ext:42`

```ts
<snippet>
```

- <claim> — `path/to/other.ext:117-130`

```ts
<snippet>
```

**Gaps / unknowns**

- <thing you couldn't determine without running something or making a change>
- <another gap>
````

## Hard rules

- **No code changes.** Not even formatting, not even "while I was here". If you find a bug, note it under Gaps; do not fix it.
- **No speculation presented as fact.** If something is inferred rather than read directly, say "likely" / "appears to" and explain what would confirm it.
- **Cite line numbers.** A filename alone is not enough — the user wants to jump straight to the code.
- **Snippets, not summaries.** Show the code. Don't paraphrase what it does when the code itself is short enough to quote.

## When the user decides to make a change

If the investigation leads to a decision to change code, **do not edit in place**. Per the user's worktree convention:

- Branch names use a prefix (`feature/`, `fix/`, `chore/`, etc.), with a topic when working in a known area: e.g. `feature/coworker/rds-proxy`, `fix/dotfiles/broken-symlink`.
- Worktree directory name must match the branch name exactly.
- Create with: `git -C ~/dev/escher worktree add <branch-name> -b <branch-name>`, then `cd ~/dev/escher/<branch-name>/`.
- Branch off `main` (fresh — don't reuse an in-progress branch).

Propose the branch name and the `worktree add` command, wait for the user to confirm, then move into the new worktree before making any edits.
