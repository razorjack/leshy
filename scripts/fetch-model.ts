import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { models, DEFAULT_MODEL } from "../src/core/detect/semantic/models.ts";

// Downloads model weights into public/models/ (gitignored). This is the ONLY
// place Leshy talks to a third party, and it happens on a developer machine —
// the app itself serves and fetches models same-origin.
//
// Usage: npm run models:fetch [-- <model-id>]

const id = process.argv[2] ?? DEFAULT_MODEL;
const spec = models[id];
if (!spec) {
  console.error(`unknown model '${id}' — known: ${Object.keys(models).join(", ")}`);
  process.exit(1);
}

const destDir = path.join("public", "models", spec.id);
mkdirSync(destDir, { recursive: true });

for (const remote of spec.source.paths) {
  const dest = path.join(destDir, path.basename(remote));
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`have  ${dest}`);
    continue;
  }
  const url = `https://huggingface.co/${spec.source.repo}/resolve/${spec.source.revision}/${remote}`;
  console.log(`fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error(`  failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(dest),
  );
  console.log(`wrote ${dest} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
}
