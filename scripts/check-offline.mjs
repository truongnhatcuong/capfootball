// Syntax validation and compilation for environments where the package registry is unavailable.
// It does not replace the full dependency-aware typecheck or production build.
import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, dirname, extname } from "node:path";
const root = process.cwd(), output = resolve(root, ".cache/offline");
function walk(folder) { return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(folder, entry.name)) : [resolve(folder, entry.name)]); }
const files = [...walk(resolve(root, "src")), ...walk(resolve(root, "tests")), ...readdirSync(root).filter((p) => /\.(ts|tsx)$/.test(p)).map((p) => resolve(root, p))].filter((p) => !p.endsWith(".d.ts") && /\.(ts|tsx|json)$/.test(p));
let errors = 0;
for (const file of files) {
  const target = resolve(output, relative(root, file).replace(/\.tsx?$/, ".js"));
  mkdirSync(dirname(target), { recursive: true });
  if (extname(file) === ".json") { writeFileSync(target, readFileSync(file)); continue; }
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  for (const diagnostic of parsed.parseDiagnostics) { console.error(`${relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`); errors++; }
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: file });
  const code = result.outputText.replace(/require\("@\/([^"]+)"\)/g, (_, path) => `require(${JSON.stringify(relative(dirname(target), resolve(output, "src", path)).replaceAll("\\", "/").replace(/^(?!\.)/, "./"))})`);
  writeFileSync(target, code);
}
console.info(`Parsed ${files.filter((f) => /\.tsx?$/.test(f)).length} TypeScript/TSX files; ${errors} syntax errors.`);
if (errors) process.exitCode = 1;
