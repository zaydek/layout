---
name: layout
description: Check a repository's file tree against repo.layout, a contract that reads like a directory listing, and fix drift. Use when a repo has a repo.layout or *.layout file, when asked to write one, when `layout .` fails, when adding, moving or renaming files in a repo with a contract, or when asked where a file belongs.
license: Proprietary. Free to use; no redistribution. See LICENSE in github.com/zaydek/layout.
---

# layout

`layout` checks a tree against `repo.layout`, a contract written like a directory listing, and exits 1
on drift. This skill carries the binary's launcher and everything an agent needs to write, read and fix
a contract.

## Run it

The binary is `bin/layout` in this skill's folder (the folder this file is in). The first run fetches
the release for this machine from github.com/zaydek/layout/releases and checks its sha256; later runs
start at once. After that first run it is also at `~/.local/share/layout/bin/layout`, and at
`~/.local/bin/layout` when that folder exists, so `layout` usually works on PATH too.

```sh
<skill folder>/bin/layout .                # Check this tree; exit 1 on drift
<skill folder>/bin/layout lint             # Check the contract's own syntax and style
<skill folder>/bin/layout format           # Rewrite the contract to house style
<skill folder>/bin/layout format --check   # Exit 1 if format would change it
<skill folder>/bin/layout --version
```

Exit codes are the API: 0 the tree matches, 1 drift (or `format --check` found a change), 2 layout
could not run or the contract itself is broken. Lint warnings never change the exit code.

Run from the repository's top folder. The contract is `repo.layout` there; a `<name>.layout.config`
beside it (for example `repo.layout.config`) holds format settings.

## How to work in a repo that has a contract

1. Before creating, moving or renaming a file, read `repo.layout` and put the file where a rule
   admits it. The contract is the answer to "where does this go?".
2. After changing files, run `layout .`. Read only the findings it prints; do not open or print file
   contents to explain them.
3. Fix drift by moving the file to where the contract wants it, never by loosening the contract,
   unless the person asked for a new kind of file. Then add the narrowest rule that admits it, with
   a comment saying why, and run `layout lint` and `layout format`.
4. Never raise a cap to make a check pass without being asked; split the file instead.

## Reference

Read the one you need; each is complete for its topic.

- `reference/grammar.md` - every construct with an example: names, folders, optional entries, `{}`,
  symlinks, hoisted regexes, binding, caps and their operators, escapes, comments.
- `reference/commands.md` - `layout .`, `lint`, `format`, the `.layout.config`, exit codes, output.
- `reference/lint.md` - every lint finding, what it means, and its fix.
- `reference/writing.md` - writing a contract for a new repo from scratch, adopting one in a messy
  repo, fixing drift, and best practices.
- `reference/recipes.md` - copyable regexes and contracts for common shapes: React, Python, Go,
  colocated tests, monorepos, no `index.ts`.
- `reference/ci.md` - running layout in CI and git hooks with a pinned, checksummed binary.
- `examples/` - complete contracts, each with a highlighted SVG; every one passes `layout lint`.

## Platforms

macOS on Apple silicon, Linux x86_64 and Linux arm64. Windows and Intel Macs are not supported; the
launcher says so in one sentence and exits 2.
