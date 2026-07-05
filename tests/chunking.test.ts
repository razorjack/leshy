import { describe, expect, it } from "vite-plus/test";
import { detectSemantic } from "../src/core/detect/semantic/detect.ts";
import { resolveConfig } from "../src/core/config.ts";
import type { Gliner } from "../src/core/detect/semantic/gliner/runtime.ts";
import type { GlinerEntity } from "../src/core/detect/semantic/gliner/types.ts";

// A model stand-in: returns every occurrence of a known name in the given chunk
// text, at chunk-relative offsets. Exercises windowing + offset remap + dedup
// without the real model (CI-safe).
const TARGETS = ["Zorluk", "Duplicaty", "Mikvane", "Perrundle", "Jan Kowalski"];
const mockGliner = {
  extractEntities: (text: string): Promise<GlinerEntity[]> => {
    const ents: GlinerEntity[] = [];
    for (const t of TARGETS) {
      for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + 1)) {
        ents.push({ text: t, start: i, end: i + t.length, label: "person", score: 0.9 });
      }
    }
    return Promise.resolve(ents);
  },
} as unknown as Gliner;

const detectors = resolveConfig().detectors;

describe("semantic chunking", () => {
  it("windows a long input, remaps offsets, dedups overlaps, catches seam PII", async () => {
    const words = Array.from({ length: 600 }, () => "lorem");
    words[5] = "Zorluk"; // start window
    words[230] = "Duplicaty"; // inside the first overlap (in two windows)
    words[249] = "Jan"; // straddles the first window seam …
    words[250] = "Kowalski"; // … only whole in the second window
    words[300] = "Mikvane"; // middle
    words[595] = "Perrundle"; // end
    const input = words.join(" ");

    const spans = await detectSemantic(input, detectors, mockGliner, 0.35);
    const texts = spans.map((s) => s.text);

    for (const name of ["Zorluk", "Duplicaty", "Mikvane", "Perrundle", "Jan Kowalski"]) {
      expect(texts).toContain(name);
    }
    // Duplicaty is in two windows but must appear once (deduped)
    expect(texts.filter((t) => t === "Duplicaty")).toHaveLength(1);
    expect(spans).toHaveLength(5);
    // every remapped offset points at exactly its text in the full input
    for (const s of spans) expect(input.slice(s.start, s.end)).toBe(s.text);
  });

  it("handles a short input as a single window", async () => {
    const input = "escalate to Zorluk about the outage";
    const spans = await detectSemantic(input, detectors, mockGliner, 0.35);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("Zorluk");
    expect(input.slice(spans[0]!.start, spans[0]!.end)).toBe("Zorluk");
  });
});
