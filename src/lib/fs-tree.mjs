// fs-tree.mjs — read a directory into the plain tree the checker walks.
//
//   readFsTree(root, ignore) -> { name, path, kind, symlinkTarget?, children[] }
//
// `path` is relative to `root` and is "" on the root node itself; `kind` is one of
// "file" | "directory" | "symlink" | "other"; `children` is sorted by name, so a
// run is reproducible. Symlinks are never followed — `lstat` throughout — so a link
// is a leaf carrying its target rather than a second copy of what it points at.
// `.git` and `node_modules` are always skipped; `ignore` is the `--ignore` globs.

import fs from "node:fs";
import path from "node:path";
import { escapeRegex } from "./scan.mjs";

// Never read, at any depth, with nothing to turn it off. Exported because the
// checker has to explain a rule that names one of these. One list, read by both.
export const NEVER_READ = [".git", "node_modules"];

export function readFsTree(root, ignore = []) {
  const matchers = ignore.map(globToRegExp);
  const stat = fs.lstatSync(root);
  // No symlinkTarget on the root: it is the directory being checked, and only a
  // CHILD's target is ever compared against an `A -> B` rule.
  const node = { name: path.basename(root), path: "", kind: kindForStat(stat), children: [] };
  if (stat.isDirectory()) readChildren(root, node, matchers);
  return node;
}

function readChildren(abs, node, matchers) {
  for (const name of fs.readdirSync(abs).sort()) {
    if (NEVER_READ.includes(name)) continue;
    const rel = node.path ? `${node.path}/${name}` : name;
    if (matchers.some((re) => re.test(name) || re.test(rel))) continue; // --ignore <glob>
    const childAbs = path.join(abs, name);
    const stat = fs.lstatSync(childAbs);
    const child = {
      name,
      path: rel,
      kind: kindForStat(stat),
      symlinkTarget: stat.isSymbolicLink() ? fs.readlinkSync(childAbs) : undefined,
      children: [],
    };
    if (stat.isDirectory()) readChildren(childAbs, child, matchers);
    node.children.push(child);
  }
}

// A small glob → RegExp: `*` matches within one segment, `**` across segments, and
// nothing else is a metacharacter. Both are parked on NUL sentinels first — a
// filename can never contain one — so the single escapeRegex (shared with
// scan.mjs, so the two escape classes cannot drift) can run over the whole string
// and the `*` pass cannot see its own output.
function globToRegExp(glob) {
  // A trailing `/` means the same thing as no trailing `/` — the pattern is
  // matched against an entry NAME and a path from the root, and neither ever ends
  // in a slash, so `--ignore vendor/` must not be a silent no-op.
  const parked = glob.replace(/\/$/, "").replaceAll("**", "\u0000\u0000").replaceAll("*", "\u0000");
  const re = escapeRegex(parked).replaceAll("\u0000\u0000", ".*").replaceAll("\u0000", "[^/]*");
  return new RegExp(`^${re}$`);
}

function kindForStat(stat) {
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}
