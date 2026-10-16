# Privacy

layout runs entirely on your machine. It reads your repository's file and folder names, its
contract (`repo.layout` and any `<name>.layout.config` beside it) and, for a cap, the line
count of the files the contract caps. To list files it runs `git ls-files` in the repository
(tracked plus untracked, minus ignored); outside a git repository it reads the folder itself. It
never reads what else a file says.

It stores nothing and sends nothing. The CLI makes no network requests: no telemetry, no
analytics, no update checks.

The one download is the launcher in `skills/layout/bin/layout`. The first time it runs, or
after a version bump, it fetches the pinned binary for your platform from this repository's
GitHub Releases, checks its sha256 against the table in the launcher, and keeps it in
`~/.local/share/layout/`. GitHub sees that request the way it sees any download.

`layout format` rewrites only the contract you point it at. Nothing else on disk changes.

To remove everything: `rm -rf ~/.local/share/layout ~/.local/bin/layout`, then uninstall
the plugin with your agent's uninstall line in the README.
