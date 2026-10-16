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
