# Writing and fixing contracts

## A new repo, from scratch

1. List what is there: `git ls-files` (plus untracked files) shows the tree layout will check.
2. Write the top level first, one line per file and folder, a comment on each folder saying what it
   is for. Top-level files are usually literal names.
3. For each folder whose members grow (components, modules, tests, posts), find the one shape its
   names share and hoist it: `$component: [A-Z][a-zA-Z0-9]*`, then `$component.tsx`. Prefer one
   named regex per shape over `.+`.
4. Use `{}` only where the tree is not yours: vendored code, generated output, assets named by
   someone else.
5. Add caps where a file should stay small: hoist one cap, `$code: <=400`, and put it on every code
   line.
6. Run `layout lint`, then `layout format`, then `layout .`, and read the crosses. Each one is either
   a rule to add or a file in the wrong place.

The starter, `examples/starter.layout`, is a loose first contract to copy and tighten.

## Adopting a contract in a messy repo

The first contract should pass on the day it lands, then tighten one folder per change:

1. Start loose: every top-level folder you are not ready to describe is `{}`. The starter does this.
2. Set each cap at today's line count or above, so nothing fails on day one.
3. In each later change, replace one `{}` with the folder's real rules, and fix what `layout .`
   then reports in that folder only.
4. Never add a list of known violations; tighten instead.

## Fixing drift

`layout .` exits 1 and prints a cross for each finding. For each:

- **Unexpected by layout**: a file no rule admits. Move it to the folder whose rule admits it, rename
  it to the shape its folder uses, or delete it if it is stray (a scratch file, a build output that
  belongs in `.gitignore`). Add a rule only when it is a new, intended kind of file, and make the
  rule as narrow as the file.
- **Missing**: a required entry is not there. Restore it, or mark it `?` if it is truly optional.
- **A cap**: the file is longer than its cap. Split it; raise the cap only when asked, in the same
  change, with a comment saying why.
- **A symlink**: the link is missing or points elsewhere. Recreate it with the exact target.
- **Binding**: a test or file whose bound name has no partner (`Button.test.tsx` without
  `Button.tsx`). Rename it to match, or move it beside its module.

Then run `layout .` again until it exits 0.

## Best practices

- One named regex per shape, named for what it is (`$component`, `$hook`, `$post`), never `.+` where
  a shape exists. The name tells the next reader what belongs.
- `{}` only where the tree isn't yours.
- A comment on every folder line: what it is for, in plain words.
- One cap hoist (`$code`) for code, applied to every code line, so a limit changes in one place.
- Bind tests to modules with the same `$name`, so a stray test is caught.
- List every top-level file by name. The top level is where strays collect.
- Keep the contract in `repo.layout` at the root, and commit it with the change that needs it.
