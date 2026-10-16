Set up layout in this repo. layout checks a repo's tree against repo.layout: https://zaydek.github.io/layout/

1. Install the layout plugin for the agent you are:
   Plugins for Claude Code, Codex, OpenCode, omp (oh-my-pi) are coming soon; until then read https://zaydek.github.io/layout/llms.txt.
2. Read the layout skill (or https://zaydek.github.io/layout/llms.txt) for the grammar.
3. Write repo.layout at the root: one named regex hoist per shape, and `{}` only for trees this repo doesn't own.
4. Run `layout lint` and `layout .` until both are green; fix the contract or the tree.
5. Add `layout .` to CI and to a pre-commit hook, so drift fails before it lands.
