import { describe, expect, it } from "vite-plus/test";
import { scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import { splitInput, splitOutput } from "../src/lib/segments.ts";
import type { Replacement } from "../src/core/types.ts";

const config = resolveConfig();

const rebuild = (segments: ReturnType<typeof splitOutput>): string =>
  segments
    .map((segment) => (segment.kind === "text" ? segment.text : segment.replacement.fake))
    .join("");

describe("splitOutput", () => {
  it("marks align with replacement ranges and reconstruct the output", async () => {
    const { output, replacements } = await scrub(
      '{"email":"jan.kowalski@gmail.com","pesel":"44051401359"}',
      { config },
    );
    const segments = splitOutput(output, replacements);
    // every mark segment's fake sits exactly at its output range
    for (const segment of segments) {
      if (segment.kind === "mark") {
        expect(output.slice(segment.replacement.start, segment.replacement.end)).toBe(
          segment.replacement.fake,
        );
      }
    }
    expect(rebuild(segments)).toBe(output);
  });

  it("stays aligned with multi-byte values (Łukasz)", () => {
    const output = 'name "Łukasz" here';
    const start = output.indexOf("Łukasz");
    const replacement: Replacement = {
      start,
      end: start + "Łukasz".length,
      sourceStart: 0,
      sourceEnd: 0,
      fake: "Łukasz",
      type: "person",
      detector: "person",
      label: "Person name",
    };
    const segments = splitOutput(output, [replacement]);
    const mark = segments.find((segment) => segment.kind === "mark");
    expect(mark && output.slice(mark.replacement.start, mark.replacement.end)).toBe("Łukasz");
    expect(rebuild(segments)).toBe(output);
  });

  it("returns a single text segment when there are no replacements", () => {
    expect(splitOutput("plain text", [])).toEqual([{ kind: "text", text: "plain text" }]);
  });
});

describe("splitInput", () => {
  it("marks cover the values the fakes replaced and reconstruct the input", async () => {
    const input = '{"email":"jan.kowalski@gmail.com","pesel":"44051401359"}';
    const { output, replacements } = await scrub(input, { config });
    const segments = splitInput(input, replacements);
    for (const segment of segments) {
      if (segment.kind === "mark") {
        expect(input.slice(segment.replacement.sourceStart, segment.replacement.sourceEnd)).toBe(
          segment.text,
        );
      }
    }
    expect(segments.map((segment) => segment.text).join("")).toBe(input);
    expect(
      segments.filter((segment) => segment.kind === "mark").map((segment) => segment.text),
    ).toEqual(["jan.kowalski@gmail.com", "44051401359"]);
    // one mark per replacement, on both sides
    expect(segments.filter((segment) => segment.kind === "mark")).toHaveLength(
      splitOutput(output, replacements).filter((segment) => segment.kind === "mark").length,
    );
  });
});
