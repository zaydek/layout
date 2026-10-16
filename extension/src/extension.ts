// The Layout extension: highlighting comes from the TextMate grammar; everything else runs the layout
// binary, which this client only spawns. It never bundles or downloads a binary of its own.
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

let output: vscode.OutputChannel;
let diagnostics: vscode.DiagnosticCollection;
let warned = false;

function candidates(): string[] {
  const configured = vscode.workspace.getConfiguration("layout").get<string>("path") ?? "";
  const home = os.homedir();
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, ".local/share");
  const onPath = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, "layout"));
  return [configured, process.env.LAYOUT_BIN ?? "", ...onPath, path.join(dataHome, "layout/bin/layout"), path.join(home, ".local/bin/layout")]
    .filter(Boolean)
    .map((p) => p.replace(/^~(?=\/)/, home));
}

function findBinary(): string | undefined {
  if (process.platform === "win32") {
    if (!warned) vscode.window.showWarningMessage("Layout's lint and format need the layout binary, which does not run on Windows. Highlighting still works.");
    warned = true;
    return undefined;
  }
  for (const file of candidates()) {
    try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch { /* Next candidate */ }
  }
  if (!warned) {
    warned = true;
    vscode.window.showInformationMessage("Layout couldn't find the layout binary. Install the layout plugin in your agent, or set layout.path.", "Open install guide")
      .then((choice) => { if (choice) vscode.env.openExternal(vscode.Uri.parse("https://github.com/zaydek/layout#install")); });
  }
  return undefined;
}

function run(bin: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, env: { ...process.env, NO_COLOR: "1" }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? (error as unknown as { code: number }).code : 2) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

// `layout lint` prints "LEVEL  <file>:<line>  <code>  <message>" for each finding.
async function lint(doc: vscode.TextDocument) {
  if (doc.languageId !== "layout" || !vscode.workspace.isTrusted) return;
  const bin = findBinary();
  if (!bin) return;
  const { stdout, stderr } = await run(bin, ["lint", doc.fileName], path.dirname(doc.fileName));
  const found: vscode.Diagnostic[] = [];
  for (const line of `${stdout}\n${stderr}`.split("\n")) {
    const m = line.match(/^\s*(ERROR|WARN)\s+.*?:(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const at = Math.max(0, Number(m[2]) - 1);
    const range = at < doc.lineCount ? doc.lineAt(at).range : new vscode.Range(0, 0, 0, 0);
    const d = new vscode.Diagnostic(range, m[4], m[1] === "ERROR" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    d.source = "layout";
    d.code = m[3];
    found.push(d);
  }
  diagnostics.set(doc.uri, found);
}

// Format runs the binary on a copy, so an unsaved buffer is formatted as it stands.
async function format(doc: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  if (!vscode.workspace.isTrusted) return [];
  const bin = findBinary();
  if (!bin) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-format-"));
  const file = path.join(dir, path.basename(doc.fileName));
  const config = `${doc.fileName}.config`;
  try {
    fs.writeFileSync(file, doc.getText());
    if (fs.existsSync(config)) fs.copyFileSync(config, `${file}.config`);
    let result = await run(bin, ["format", file], dir);
    if (result.code === 2) result = await run(bin, ["fmt", file], dir);
    if (result.code === 2) { output.appendLine(result.stderr || result.stdout); return []; }
    const text = fs.readFileSync(file, "utf8");
    if (text === doc.getText()) return [];
    return [vscode.TextEdit.replace(new vscode.Range(0, 0, doc.lineCount, 0), text)];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function check() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const bin = findBinary();
  if (!folder || !bin) return;
  const { code, stdout, stderr } = await run(bin, [".", "--color", "off"], folder.uri.fsPath);
  output.clear();
  output.append(stdout + stderr);
  output.show(true);
  const words = code === 0 ? "The tree matches its contract." : code === 1 ? "The tree has drifted from its contract; the Layout output lists each finding." : "layout could not check this tree; the Layout output says why.";
  (code === 0 ? vscode.window.showInformationMessage : vscode.window.showWarningMessage)(words);
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel("Layout");
  diagnostics = vscode.languages.createDiagnosticCollection("layout");
  const onSave = () => vscode.workspace.getConfiguration("layout").get<boolean>("lintOnSave", true);
  context.subscriptions.push(
    output,
    diagnostics,
    vscode.commands.registerCommand("layout.check", check),
    vscode.languages.registerDocumentFormattingEditProvider("layout", { provideDocumentFormattingEdits: format }),
    vscode.workspace.onDidOpenTextDocument((d) => { if (onSave()) lint(d); }),
    vscode.workspace.onDidSaveTextDocument((d) => { if (onSave()) lint(d); }),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
  );
  for (const d of vscode.workspace.textDocuments) if (onSave()) lint(d);
}

export function deactivate() {}
