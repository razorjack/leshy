/// <reference types="node" />
// (Self-typing: the per-file staged `vp check` doesn't apply tsconfig.node.json.)
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Per-user install of the unpacked Linux build, the counterpart of dragging
// Leshy.app into /Applications (adr/0007): copies release/linux-unpacked under
// $XDG_DATA_HOME and registers a launcher entry with the app icon. No root.
//
// Usage: npm run desktop:install · node scripts/linux-install.ts --remove

if (process.platform !== "linux") {
  console.error("desktop:install is Linux-only; on macOS drag Leshy.app to /Applications");
  process.exit(1);
}

const data = process.env["XDG_DATA_HOME"] || path.join(homedir(), ".local", "share");
const app = path.join(data, "leshy");
const entry = path.join(data, "applications", "leshy.desktop");
const icon = path.join(data, "icons", "hicolor", "512x512", "apps", "leshy.png");

if (process.argv.includes("--remove")) {
  for (const p of [app, entry, icon]) rmSync(p, { recursive: true, force: true });
  console.log(`removed ${app}, ${entry}, ${icon}`);
  process.exit(0);
}

const build = path.resolve("release", "linux-unpacked");
if (!existsSync(path.join(build, "leshy"))) {
  console.error(`no build in ${build}; run npm run desktop:pack first`);
  process.exit(1);
}

rmSync(app, { recursive: true, force: true });
cpSync(build, app, { recursive: true, verbatimSymlinks: true });
mkdirSync(path.dirname(icon), { recursive: true });
copyFileSync(path.join("public", "icons", "icon-512.png"), icon);
mkdirSync(path.dirname(entry), { recursive: true });
// StartupWMClass must equal the app_id Electron derives from desktopName in
// package.json, or the running window is not linked to this entry.
writeFileSync(
  entry,
  [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Leshy",
    "Comment=Scrub PII out of debugging data before it reaches an LLM",
    `Exec="${path.join(app, "leshy")}" %U`,
    "Icon=leshy",
    "StartupWMClass=leshy",
    "Categories=Development;",
    "Terminal=false",
    "",
  ].join("\n"),
);
console.log(`installed ${app}\nlauncher  ${entry}`);
