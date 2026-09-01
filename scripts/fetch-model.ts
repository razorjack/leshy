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

const modelId = process.argv[2] ?? DEFAULT_MODEL;
const model = models[modelId];
if (!model) {
  console.error(`unknown model '${modelId}' — known: ${Object.keys(models).join(", ")}`);
  process.exit(1);
}

const destinationDirectory = path.join("public", "models", model.id);
mkdirSync(destinationDirectory, { recursive: true });

for (const remotePath of model.source.paths) {
  const destination = path.join(destinationDirectory, path.basename(remotePath));
  if (existsSync(destination) && statSync(destination).size > 0) {
    console.log(`have  ${destination}`);
    continue;
  }
  const url = `https://huggingface.co/${model.source.repo}/resolve/${model.source.revision}/${remotePath}`;
  console.log(`fetch ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    console.error(`  failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(destination),
  );
  console.log(`wrote ${destination} (${(statSync(destination).size / 1e6).toFixed(1)} MB)`);
}
