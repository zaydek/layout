# Recipes

These are suggestions to copy and change. layout has no built-in patterns; every regex here is yours
to edit.

## Suggested regexes

```layout
$component: [A-Z][a-zA-Z0-9]*
$hook:      use[A-Z][a-zA-Z0-9]*
$kebab:     [a-z0-9]+(-[a-z0-9]+)*
$snake:     [a-z][a-z0-9_]*
$day:       \d{4}-\d{2}-\d{2}
$post:      $day-$kebab
$media:     png|jpg|jpeg|gif|webp|svg|mp4|webm
$code:      <=400

src/                                   # The app
  $component.tsx $code
  $hook.ts $code
  $snake.py $code
posts/                                 # Dated posts
  $post.md
assets/                                # Images and films
  $kebab.$media
```

- `$component` PascalCase React components; `$hook` React hooks.
- `$kebab` kebab-case slugs and file names; `$snake` Python modules.
- `$day` an ISO date; `$post` a dated slug, built from two others.
- `$media` an extension list; extend it to what you ship.

## Colocated tests

A test sits beside its module and shares its name; a test with no module is drift.

```layout
$component: [A-Z][a-zA-Z0-9]*

components/                            # One file per component
  $component.tsx
  ?$component.test.tsx                 # Optional, and only beside its module
```

Python and Go use `{$name}` because `_` is a word character:

```layout
$mod: [a-z][a-z0-9_]*

app/                                   # The package
  __init__.py
  $mod.py
  ?{$mod}_test.py                      # Beside its module
```

## No index.ts anywhere

A contract is an allowlist, so a file it does not name is already drift. Name your modules with a
shape that `index` does not need, and no barrel file can appear:

```layout
$component: [A-Z][a-zA-Z0-9]*

components/                            # One file per component, no barrel
  $component.tsx
```

`components/index.ts` is "Unexpected by layout": `index` does not match `[A-Z]...`.

## A folder per thing, named once

```layout
$tool: [a-z][a-z0-9-]*

tools/                                 # One folder per tool
  $tool/                               # Named by its folder
    $tool.mjs
    ?README.md
```

## A monorepo

Each package carries its own `repo.layout`; the root contract admits the packages and leaves their
insides to them with `{}`. CI runs `layout .` once per contract (see `ci.md`).

```layout
$pkg: [a-z][a-z0-9-]*

README.md
package.json
repo.layout                            # This contract
packages/                              # One folder per package
  $pkg/                                # Each checks itself with its own
                                       # repo.layout
    {}
```

## Complete examples

`examples/` holds complete contracts for a React app, a Python package, a Go module and a starter,
each with a highlighted SVG.
