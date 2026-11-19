// Copies Monaco's prebuilt AMD bundle into public/ so the editor is served by
// this app instead of a CDN. Runs before dev and build (see package.json).
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "monaco-editor", "min", "vs");
const to = join(root, "public", "vendor", "monaco", "vs");

if (!existsSync(from)) {
  console.error("[copy-monaco] monaco-editor is not installed; run npm install");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("[copy-monaco] copied to public/vendor/monaco/vs");
