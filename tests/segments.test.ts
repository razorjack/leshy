import { describe, expect, it } from "vite-plus/test";
import { scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import { splitOutput } from "../src/lib/segments.ts";
import type { Replacement } from "../src/core/types.ts";

const config = resolveConfig();

const rebuild = (segs: ReturnType<typeof splitOutput>): string =>
  segs.map((s) => (s.kind === "text" ? s.text : s.rep.fake)).join("");

describe("splitOutput", () => {
  it("marks align with replacement ranges and reconstruct the output", async () => {
    const { output, replacements } = await scrub(
      '{"email":"jan.kowalski@gmail.com","pesel":"44051401359"}',
      { config },
    );
    const segs = splitOutput(output, replacements);
    // every mark segment's fake sits exactly at its output range
    for (const seg of segs) {
      if (seg.kind === "mark") {
        expect(output.slice(seg.rep.start, seg.rep.end)).toBe(seg.rep.fake);
      }
    }
    expect(rebuild(segs)).toBe(output);
  });

  it("stays aligned with multi-byte values (Łukasz)", () => {
    const output = 'name "Łukasz" here';
    const start = output.indexOf("Łukasz");
    const rep: Replacement = {
      start,
      end: start + "Łukasz".length,
      sourceStart: 0,
      sourceEnd: 0,
      fake: "Łukasz",
      type: "person",
      detector: "person",
      label: "Person name",
    };
    const segs = splitOutput(output, [rep]);
    const mark = segs.find((s) => s.kind === "mark");
    expect(mark && output.slice(mark.rep.start, mark.rep.end)).toBe("Łukasz");
    expect(rebuild(segs)).toBe(output);
  });

  it("returns a single text segment when there are no replacements", () => {
    expect(splitOutput("plain text", [])).toEqual([{ kind: "text", text: "plain text" }]);
  });
});
