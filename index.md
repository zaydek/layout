# layout

`layout` checks a repo's tree against `repo.layout`, a contract that reads like a directory listing, and exits 1 on drift.

Source of truth: [the README](https://github.com/zaydek/layout/blob/main/README.md). Site: https://zaydek.github.io/layout/

## Example

```text
$slug: [a-z0-9]+(-[a-z0-9]+)*
$code: <=2,000

README.md                              # What this repo is
repo.layout                            # This file
src/                                   # One module per concern
  $slug.ts $code
```

```text
$ layout .
✗ notes.txt                                 # Unexpected by layout
✓ README.md                                 # What this repo is
✓ repo.layout                               # This file
✗ src/                                      # One module per concern
├─ ✓ $slug.ts
├─ ✗ checker.ts                             # 2300 lines, outside its cap <=2,000
└─ ✗ Main.ts                                # Unexpected by layout
```

Exit 1.

## Setup prompt

Paste this into your coding agent (also at https://zaydek.github.io/layout/setup.md):

```text
Set up layout in this repo. layout checks a repo's tree against repo.layout: https://zaydek.github.io/layout/

1. Install the layout plugin for the agent you are:
   - Claude Code: claude plugin marketplace add zaydek/layout && claude plugin install layout@layout
   - Codex: codex plugin marketplace add zaydek/layout && codex plugin add layout@layout
   - OpenCode: coming soon; until then read https://zaydek.github.io/layout/llms.txt
   - omp (oh-my-pi): omp plugin marketplace add zaydek/layout && omp plugin install layout@layout
2. Read the layout skill (or https://zaydek.github.io/layout/llms.txt) for the grammar.
3. Write repo.layout at the root: one named regex hoist per shape, and `{}` only for trees this repo doesn't own.
4. Run `layout lint` and `layout .` until both are green; fix the contract or the tree.
5. Add `layout .` to CI and to a pre-commit hook, so drift fails before it lands.
```

## Install

A plugin for your coding agent.

- Claude Code: `claude plugin marketplace add zaydek/layout && claude plugin install layout@layout`
- Codex: `codex plugin marketplace add zaydek/layout && codex plugin add layout@layout`
- OpenCode: coming soon
- omp (oh-my-pi): `omp plugin marketplace add zaydek/layout && omp plugin install layout@layout`

## Grammar

```text
# Names: a regex or a cap, used below as $name
$component: [A-Z][a-zA-Z0-9]*          # e.g. Button, UserCard
$hook:      use[A-Z][a-zA-Z0-9]*       # e.g. useAuth, useTheme
$code:      <=400                      # At most 400 lines

# The tree: every entry this repo may hold
README.md                              # One: a plain name is exactly one file
package.json
?CHANGELOG.md                          # ? marks an entry optional
src/                                   # The app
  main.tsx
  components/                          # One component per file
    $component.tsx $code               # Many: a pattern matches any number
    ?$component.test.tsx               # An optional test beside it
  hooks/                               # One hook per file
    $hook.ts $code                     # A hoisted cap
public/                                # Static files, served as is
  {}                                   # Anything goes here
docs -> ../docs                        # A symlink
```

### Python package

```text
# Names: a regex or a cap, used below as $name
$mod:  [a-z][a-z0-9_]*                 # e.g. parser, http_client
$code: <=800                           # At most 800 lines

# The tree: every entry this repo may hold
README.md                              # One: a plain name is exactly one file
pyproject.toml
repo.layout                            # This contract
?uv.lock                               # ? marks an entry optional
src/                                   # The package, under src/
  app/                                 # The import name
    __init__.py
    $mod.py $code                      # Many: one module per concern
    ?{$mod}_test.py                    # An optional test beside it
```

### Go service

```text
# Names: a regex or a cap, used below as $name
$cmd:  [a-z][a-z0-9-]*                 # e.g. api, migrate-db
$pkg:  [a-z][a-z0-9]*                  # e.g. auth, billing
$file: [a-z][a-z0-9_]*                 # e.g. handler, user_store
$code: <=1,000                         # At most 1,000 lines

# The tree: every entry this repo may hold
README.md
go.mod
?go.sum
repo.layout                            # This contract
cmd/                                   # One folder per binary
  $cmd/                                # One binary, named by its folder
    main.go
internal/                              # Private to this module
  $pkg/                                # One package per folder
    $file.go $code
    ?{$file}_test.go                   # An optional test beside it
pkg/                                   # Importable by other modules
  $pkg/                                # A public package
    {}                                 # Anything goes here
```

## Commands

```sh
layout .                   # Check this tree; exit 1 on drift
layout lint repo.layout    # Check the contract's own syntax
layout format              # Rewrite the contract to house style
layout format --check      # Exit 1 if format would change it
```

Exit codes: 0 the tree matches, 1 drift, 2 layout could not run or the contract is broken.
