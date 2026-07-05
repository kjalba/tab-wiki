// Builds the extension into dist/firefox and dist/chromium.
// Usage: node build.mjs [firefox|chromium|all]
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const targets = process.argv[2] === "all" || !process.argv[2]
  ? ["firefox", "chromium"]
  : [process.argv[2]];

for (const target of targets) {
  const out = `dist/${target}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  await esbuild.build({
    entryPoints: ["src/background.ts", "src/popup.ts", "src/receipt.ts", "src/explore.ts"],
    bundle: true,
    format: "iife",
    outdir: out,
    logLevel: "info",
  });

  for (const f of ["popup.html", "receipt.html", "explore.html", "style.css"]) {
    cpSync(`src/${f}`, `${out}/${f}`);
  }
  cpSync("icons", `${out}/icons`, { recursive: true });
  cpSync(`manifest.${target}.json`, `${out}/manifest.json`);
}
