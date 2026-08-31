// examples.mjs — the built-in findings fixture behind `layout render --example`.
//
//   exampleFindings(name) -> a findings object, ready for `renderFindings`
//
// There is exactly one, "stress": it exercises all three levels, nested slots, and
// both views the renderer draws, with no fixture directory to keep in sync. Every
// row that has children carries `directory: true` — the only way a flat list can
// draw the trailing slash a tree infers from its own shape.

export function exampleFindings(name) {
  if (name !== "stress") throw new Error(`Unknown render example: ${name}`);
  return {
    root: ".",
    layout: [
      { level: "ok", path: "tools", directory: true },
      { level: "ok", path: "tools/INDEX.md" },
      { level: "ok", path: "tools/lib", directory: true },
      { level: "warn", path: "tools/lib/shared.mjs", message: "Verify at least two slugs import it" },
      { level: "ok", path: "tools/topics", directory: true },
      { level: "ok", path: "tools/topics/{:topic;catalog}", directory: true },
      { level: "warn", path: "tools/topics/{:topic;catalog}/INDEX.md", message: "Stale; missing diagnose-adapters" },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;catalog}", directory: true },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;catalog}/{:slug}.tool.md" },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;catalog}/{:slug}.tool.mjs" },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;check-catalog}", directory: true },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;check-catalog}/{:slug}.tool.md" },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;check-catalog}/{:slug}.tool.mjs" },
      { level: "warn", path: "tools/topics/{:topic;catalog}/{:slug;diagnose-adapters}", message: "Missing from topic INDEX.md", directory: true },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;diagnose-adapters}/{:slug}.tool.md" },
      { level: "ok", path: "tools/topics/{:topic;catalog}/{:slug;diagnose-adapters}/{:slug}.tool.mjs" },
      { level: "ok", path: "tools/topics/{:topic;layout}", directory: true },
      { level: "error", path: "tools/topics/{:topic;layout}/{:slug;audit-layout}", message: "Slug body incomplete", directory: true },
      { level: "ok", path: "tools/topics/{:topic;layout}/{:slug;audit-layout}/{:slug}.tool.md" },
      { level: "error", path: "tools/topics/{:topic;layout}/{:slug;audit-layout}/{:slug}.tool.mjs", message: "Required executable missing" },
      { level: "warn", path: "tools/topics/{:topic;layout}/{:slug;audit-layout}/.artifacts", message: "Must be untracked" },
      { level: "error", path: "tools/topics/{:topic;backpressure}", message: "Topic missing INDEX.md", directory: true },
      { level: "error", path: "tools/topics/{:topic;backpressure}/INDEX.md", message: "Required topic index missing" },
      { level: "ok", path: "tools/topics/{:topic;backpressure}/{:slug;line-count}", directory: true },
      { level: "ok", path: "tools/topics/{:topic;backpressure}/{:slug;line-count}/{:slug}.tool.md" },
      { level: "ok", path: "tools/topics/{:topic;backpressure}/{:slug;line-count}/{:slug}.tool.mjs" },
      { level: "error", path: "tools/topics/{:topic;backpressure}/{:slug;line-count}/linecount.mjs", message: "Expected line-count.tool.mjs" },
      { level: "error", path: "tools/scratch.mjs", message: "Unexpected root executable; move under topics/{:topic}/{:slug}/" },
    ],
    items: [
      { level: "ok", path: "tools/INDEX.md" },
      { level: "ok", path: "tools/lib/shared.mjs" },
      { level: "warn", path: "tools/lib/shared.mjs", message: "Verify at least two slugs import it" },
      { level: "ok", path: "tools/topics/catalog/catalog/catalog.tool.md" },
      { level: "ok", path: "tools/topics/catalog/catalog/catalog.tool.mjs" },
      { level: "ok", path: "tools/topics/catalog/check-catalog/check-catalog.tool.md" },
      { level: "ok", path: "tools/topics/catalog/check-catalog/check-catalog.tool.mjs" },
      { level: "warn", path: "tools/topics/catalog/INDEX.md", message: "Stale; missing diagnose-adapters" },
      { level: "ok", path: "tools/topics/catalog/diagnose-adapters/diagnose-adapters.tool.md" },
      { level: "ok", path: "tools/topics/catalog/diagnose-adapters/diagnose-adapters.tool.mjs" },
      { level: "warn", path: "tools/topics/catalog/diagnose-adapters", message: "Missing from topic INDEX.md", directory: true },
      { level: "ok", path: "tools/topics/layout/audit-layout/audit-layout.tool.md" },
      { level: "error", path: "tools/topics/layout/audit-layout", message: "Slug body incomplete", directory: true },
      { level: "error", path: "tools/topics/layout/audit-layout/audit-layout.tool.mjs", message: "Required executable missing" },
      { level: "warn", path: "tools/topics/layout/audit-layout/.artifacts", message: "Must be untracked" },
      { level: "error", path: "tools/topics/backpressure", message: "Topic missing INDEX.md", directory: true },
      { level: "error", path: "tools/topics/backpressure/INDEX.md", message: "Required topic index missing" },
      { level: "ok", path: "tools/topics/backpressure/line-count/line-count.tool.md" },
      { level: "ok", path: "tools/topics/backpressure/line-count/line-count.tool.mjs" },
      { level: "error", path: "tools/topics/backpressure/line-count/linecount.mjs", message: "Expected line-count.tool.mjs" },
      { level: "error", path: "tools/scratch.mjs", message: "Unexpected root executable; move under topics/{:topic}/{:slug}/" },
    ],
  };
}
