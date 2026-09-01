/// <reference types="node" />
// (Self-typing: the per-file staged `vp check` doesn't apply tsconfig.node.json.)
import { existsSync } from "node:fs";
import path from "node:path";
import { detect, scrub } from "../../src/core/engine.ts";
import { resolveConfig } from "../../src/core/config.ts";
import { detectSemantic } from "../../src/core/detect/semantic/detect.ts";
import { models, DEFAULT_MODEL } from "../../src/core/detect/semantic/models.ts";
import { samples, hardSamples } from "../../tests/fixtures/samples.ts";
import { addScores, evaluateSample, type SampleScore } from "./evaluate.ts";
import { loadGlinerNode } from "./gliner-node.ts";

// The PII validation spike (docs/adr/0001-pii-detection.md). Runs the full
// detection pipeline — structural + key-context + GLiNER — over the brief's
// samples plus a hard set with no key hints, and fails on any regression.
//
// Usage: npm run models:fetch && npm run spike [-- <model-id>]

const modelId = process.argv[2] ?? DEFAULT_MODEL;
const model = models[modelId];
if (!model) {
  console.error(`unknown model '${modelId}' — known: ${Object.keys(models).join(", ")}`);
  process.exit(1);
}
const weights = path.join("public", "models", model.id, model.files.weights);
if (!existsSync(weights)) {
  console.error(`missing ${weights} — run: npm run models:fetch -- ${model.id}`);
  process.exit(1);
}

const config = resolveConfig();
const zero: SampleScore = { full: 0, partial: 0, miss: 0, preserveViolations: 0 };

console.log("=== structural + key-context only (model off) ===");
let noModel = zero;
for (const sample of samples) {
  const spans = await detect(sample.input, { config });
  noModel = addScores(noModel, evaluateSample(sample, spans, true));
}

console.log(`\n=== full pipeline: + ${model.id} @ threshold ${config.semantic.threshold} ===`);
const loadStartedAt = performance.now();
const gliner = await loadGlinerNode(modelId);
console.log(`(model loaded in ${((performance.now() - loadStartedAt) / 1000).toFixed(1)}s)`);

const semantic = (input: string): ReturnType<typeof detectSemantic> =>
  detectSemantic(input, config.detectors, gliner, config.semantic.threshold);

let full = zero;
let totalMs = 0;
for (const sample of [...samples, ...hardSamples]) {
  const detectionStartedAt = performance.now();
  const spans = await detect(sample.input, { config, semantic });
  totalMs += performance.now() - detectionStartedAt;
  full = addScores(full, evaluateSample(sample, spans, true));
}

const goldCount = [...samples, ...hardSamples]
  .flatMap((sample) => sample.gold)
  .filter((expectation) => expectation.expect === "catch").length;
console.log(
  `\nno-model:  full=${noModel.full} partial=${noModel.partial} miss=${noModel.miss} preserve-violations=${noModel.preserveViolations}`,
);
console.log(
  `pipeline:  full=${full.full}/${goldCount} partial=${full.partial} miss=${full.miss} preserve-violations=${full.preserveViolations}`,
);
console.log(
  `avg detect latency: ${(totalMs / (samples.length + hardSamples.length)).toFixed(0)}ms/sample`,
);

console.log("\n=== scrub pass (full pipeline) ===");
let scrubFail = 0;
for (const sample of [...samples, ...hardSamples]) {
  const scrubResult = await scrub(sample.input, { config, semantic });
  for (const expectation of sample.gold) {
    if (expectation.expect === "catch" && scrubResult.output.includes(expectation.text)) {
      console.log(`  [LEAK    ] ${sample.name}: "${expectation.text}" survived scrub`);
      scrubFail++;
    }
    if (expectation.expect === "preserve" && !scrubResult.output.includes(expectation.text)) {
      console.log(`  [PRESERVE] ${sample.name}: "${expectation.text}" did not survive`);
      scrubFail++;
    }
  }
}

// Idempotence for namespace-fixed structured content (adr/0002): a second pass
// must be a no-op. Semantic types (person/address/org) are excluded — they are
// only within-run idempotent by design.
const structured =
  'email=jan@corp.com ip=8.8.8.8 ssn=123-45-6789 pesel=44051401359 mac="00:1B:44:11:3A:B7"';
for (const [label, input] of [
  ["structured", structured],
  ["logfmt", samples[4]!.input],
] as const) {
  const once = await scrub(input, { config, semantic });
  const twice = await scrub(once.output, { config, semantic });
  if (once.output !== twice.output) {
    console.log(`  [IDEMPOTENCE] ${label}: re-scrub changed the output`);
    scrubFail++;
  }
}
console.log(
  scrubFail === 0
    ? "scrub: no leaks, preserves intact, idempotent"
    : `scrub: ${scrubFail} failures`,
);

// Chunking (adr/0003): a 5k-word log with the same name at the start, a window
// seam, the middle and the end — every occurrence must be caught and scrubbed.
console.log("\n=== chunking (5k-word input) ===");
const words = "the transaction was processed ".repeat(1250).trim().split(" ");
for (const position of [3, 249, 2500, 4990]) {
  words[position] = "Jan";
  words[position + 1] = "Kowalski";
}
const bigLog = words.join(" ");
const expected = (bigLog.match(/Jan Kowalski/g) ?? []).length;
const bigOut = (await scrub(bigLog, { config, semantic })).output;
const survived = (bigOut.match(/Jan Kowalski/g) ?? []).length;
if (survived > 0) {
  console.log(`  [CHUNK] ${survived}/${expected} occurrences survived scrub`);
  scrubFail++;
} else {
  console.log(`chunking: all ${expected} occurrences across windows caught`);
}

const pass =
  full.full === goldCount &&
  full.partial === 0 &&
  full.miss === 0 &&
  full.preserveViolations === 0 &&
  scrubFail === 0;
console.log(pass ? "\nPASS" : "\nFAIL");
process.exit(pass ? 0 : 1);
