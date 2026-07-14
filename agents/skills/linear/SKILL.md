---
name: linear
description: |
  Manage Linear (issues, projects, labels, teams, cycles, discussions)
  from the command line using the linearis CLI — installed as both
  `linearis` and `linear`. Use when asked to create, update, search, or
  comment on Linear issues/tickets, file bugs or launch blockers, or
  query projects, labels, milestones, and users.
allowed-tools:
  - Bash
---

# Linear via linearis

The `linear` binary on this machine is an alias for **linearis**
("CLI for Linear.app with JSON output"), NOT schpet's `linear-cli`.
The two have incompatible command shapes — linearis uses plural domains
(`issues`, `projects`, `teams`), positional titles on create, and has no
GraphQL passthrough (`api`) command. If a command errors with
"too many arguments", you're probably using the other CLI's syntax.

Auth: token at `~/.linearis/token` (`linear auth status` to check).

## Discovery

`--help` on nested subcommands is unreliable (often prints the root help).
Use the built-in usage docs instead — they're complete and accurate:

```bash
linear usage                 # domain overview
linear issues usage          # every command + flag for a domain
linear projects usage
```

## Output shapes

Everything is JSON. List commands return `{ nodes: [...], pageInfo }`;
create/read return the bare object:

```bash
linear teams list | jq -r '.nodes[].key'
linear issues read ANY-3621 | jq -r '.branchName'
```

## Verified flows

```bash
# Create (title is positional; --team is required; human-readable ids
# work everywhere: team key, project/label names, assignee email)
linear issues create "Title here" \
  --team ANY --project Skydive --labels launch-blocker \
  --assignee user@example.com --description "$(cat /tmp/body.md)"

# Read — includes description, comments, and branchName (Linear's
# suggested git branch, handy for worktrees). There is no `url` field;
# construct https://linear.app/<workspace>/issue/<ID> if needed.
linear issues read ANY-3621

# List / search (search is full-text; list is filters-only)
linear issues list --team ANY --assignee user@example.com --status "In Progress"
linear issues search "mcp oauth" --team ANY

# Discussions (the `comments` domain is a deprecated facade — use these)
linear issues discuss ANY-3621 --body "root comment"
linear issues discussions ANY-3621
```

## Gotchas (field-tested)

- Multi-line markdown bodies: there is **no** `--description-file` /
  `--body-file`. Write the markdown to a file and pass
  `--description "$(cat /tmp/body.md)"` — formatting survives.
- `projects list` at the default limit can exceed Linear's GraphQL
  complexity cap ("Query too complex") — pass `--limit 25`.
- `issues list --status` and `--cycle` require `--team`.
- No raw-GraphQL escape hatch. If linearis can't do it, say so rather
  than hand-rolling curl against the API.

## Workspace notes

- Teams: `ANY` (Anything — most product work), `COPY` (Copy).
- Launch triage labels: `launch-blocker`, `launch-fast-follow`,
  `launch-later`, `beta-blocker`.
