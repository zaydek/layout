# CI and git hooks

layout is the gate in CI and a convenience in hooks. Always pin a release; there is no `latest`.

## What any CI needs

- The pinned binary for the runner (below), checked against its sha256.
- git on PATH and a full checkout: `fetch-depth: 0` on GitHub, `GIT_DEPTH: 0` on GitLab. A cap
  that grew is judged against the base commit, and a shallow checkout has no base.
- Run at the repository's top, where `repo.layout` is.
- Branch on the exit code: 0 pass, 1 drift (fail the job), 2 layout could not run (fail the job).

layout checks the whole tree every time, never only changed files: a stray file anywhere, a missing
required file or a broken binding is drift no matter which change caused it. There is no `--staged`
or `--since` mode, by design. Don't put a `paths:` filter on the workflow either; a required check
that does not run cannot block a merge.

## GitHub Actions

```yaml
name: layout
on:
  push:
    branches: [main]
  pull_request:
  merge_group:
permissions:
  contents: read
jobs:
  layout:
    name: layout
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: zaydek/layout/.github/actions/layout@<commit sha> # pin the commit of a release
        with:
          version: 0.1.1
```

Inputs: `version` (required), `args` (default `.`), `working-directory`, `mark-findings` (default `true`:
an annotation on each finding's file in the pull request), and `binary-path` to run a mirrored binary instead
of downloading. The action refuses a Windows runner with one sentence. It caches the binary by
version, OS and architecture, and re-checks its sha256 on a cache hit.

Make `layout` a required status check in a branch ruleset; the job name is stable. Keep
`merge_group:` so a merge queue runs it too.

## Other CI

Each fetches the pinned release, checks it against `SHA256SUMS` from the same release, and runs it.

```sh
# Any POSIX runner with curl: pin the version, check the sum, run.
V=0.1.1
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) T=linux-x64 ;; Linux-aarch64) T=linux-arm64 ;; Darwin-arm64) T=darwin-arm64 ;;
  *) echo "layout does not run on this system"; exit 2 ;;
esac
curl -fsSLO "https://github.com/zaydek/layout/releases/download/v$V/layout-$T"
curl -fsSLO "https://github.com/zaydek/layout/releases/download/v$V/SHA256SUMS"
grep " layout-$T\$" SHA256SUMS | sha256sum -c -
chmod +x "layout-$T" && "./layout-$T" .
```

- **GitLab CI**: put the script above in a job with `variables: { GIT_DEPTH: "0" }` and
  `interruptible: true`; a non-zero exit fails the job.
- **CircleCI**: a `run:` step with the script; check out with full history.
- **Buildkite**: a command step with the script; the agent's checkout must not be shallow.
- **Jenkins**: `sh` the script in a stage; `sh` fails the stage on exit 1 or 2. Don't wrap it in
  `catchError` or mark the build unstable instead.

These snippets are shown, not yet run in this repository's CI; the GitHub Action is.

## Git hooks

Hooks give fast feedback; CI is the gate. A hook sees the working tree, so an untracked scratch file
blocks a commit until it is removed, ignored or admitted.

pre-commit (`.pre-commit-config.yaml`):

```yaml
repos:
  - repo: https://github.com/zaydek/layout
    rev: v0.1.1
    hooks:
      - id: layout
```

A plain git hook (`.git/hooks/pre-commit`, executable), once the plugin or a CI step has put the
binary in its stable place:

```sh
#!/bin/sh
exec "${LAYOUT_BIN:-$HOME/.local/share/layout/bin/layout}" .
```

## Where the binary lives

The launcher (`skills/layout/bin/layout`, which every plugin and the action run) keeps each release at
`~/.local/share/layout/<version>/layout` (`$XDG_DATA_HOME` and `$LAYOUT_HOME` move it), points
`~/.local/share/layout/bin/layout` at the newest one, and links `~/.local/bin/layout` to that when
`~/.local/bin` exists and holds no other `layout`. Tools outside an agent look there, or take
`$LAYOUT_BIN`.

## Air-gapped and offline

layout makes no network calls of its own, sends no telemetry and never updates itself. Only the
launcher downloads, once per version. To run without network, copy the release's binary and
`SHA256SUMS` to your mirror, check the sum, and set `LAYOUT_BIN` (or the action's `binary-path`) to
it; `LAYOUT_OFFLINE=1` makes the launcher fail rather than download.

## Not supported

Windows (native) and Intel Macs. Alpine and other musl systems are not supported yet.
