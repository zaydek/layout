// Reads layout's JSON findings on stdin and prints one GitHub annotation for each finding.
// Values are escaped so a file name cannot forge a workflow command.
let text = "";
for await (const chunk of process.stdin) text += chunk;
const data = (property) => (value) => {
  let s = String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  if (property) s = s.replace(/:/g, "%3A").replace(/,/g, "%2C");
  return s;
};
const prop = data(true), msg = data(false);
const report = JSON.parse(text);
for (const item of report.items ?? []) {
  const level = String(item.level).toLowerCase();
  if (level !== "error" && level !== "warn") continue;
  const kind = level === "error" ? "error" : "warning";
  const where = item.path ? `file=${prop(item.path)}${item.line ? `,line=${item.line}` : ""},` : "";
  console.log(`::${kind} ${where}title=${prop("layout")}::${msg(item.message || "Unexpected by layout")}`);
}
