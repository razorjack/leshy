import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const source = path.resolve("assets/macos/Leshy.icon");
const output = path.resolve("assets/macos/compiled");
const work = mkdtempSync(path.join(tmpdir(), "leshy-icon-"));
const icon = path.join(work, "Icon.icon");
const compiled = path.join(work, "out");

try {
  cpSync(source, icon, { recursive: true });
  mkdirSync(compiled);
  execFileSync(
    "xcrun",
    [
      "actool",
      icon,
      "--compile",
      compiled,
      "--output-format",
      "human-readable-text",
      "--notices",
      "--warnings",
      "--output-partial-info-plist",
      path.join(compiled, "assetcatalog_generated_info.plist"),
      "--app-icon",
      "Icon",
      "--include-all-app-icons",
      "--enable-on-demand-resources",
      "NO",
      "--development-region",
      "en",
      "--target-device",
      "mac",
      "--minimum-deployment-target",
      "26.0",
      "--platform",
      "macosx",
    ],
    { stdio: "inherit" },
  );
  mkdirSync(output, { recursive: true });
  for (const file of ["Assets.car", "Icon.icns", "assetcatalog_generated_info.plist"]) {
    copyFileSync(path.join(compiled, file), path.join(output, file));
  }
  console.log(
    "wrote assets/macos/compiled/{Assets.car,Icon.icns,assetcatalog_generated_info.plist}",
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
