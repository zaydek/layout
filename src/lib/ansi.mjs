// ansi.mjs — the terminal escape codes `renderer.mjs` and `help.mjs` share.
//
//   ANSI             the code table: bold, dim, reset, and the three colors in use
//   stripAnsi(text)  the same text with every `\x1b[…m` sequence removed
//   columns(text)    how many columns it occupies: code POINTS, escapes removed
//
// Whether to color is the caller's decision (a TTY check, `--color`, `NO_COLOR`);
// there is no policy here, only the codes.

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

// Code POINTS, not UTF-16 code units, and not display columns: a wide glyph still
// occupies two terminal cells, and measuring that needs a Unicode width table this
// dependency-free tool does not carry. Every place that lines text up measures here.
export function columns(text) {
  return [...stripAnsi(String(text))].length;
}
