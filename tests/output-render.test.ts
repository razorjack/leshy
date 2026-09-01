import { describe, expect, it } from "vite-plus/test";
import { render } from "svelte/server";
import { session } from "../src/state/session.svelte.ts";
import OutputPane from "../src/lib/components/OutputPane.svelte";
import type { Replacement } from "../src/core/types.ts";

const replacement = (start: number, end: number, fake: string): Replacement => ({
  start,
  end,
  sourceStart: 0,
  sourceEnd: 0,
  fake,
  type: "person",
  detector: "person",
  label: "Person name",
});

const visibleText = (): string =>
  render(OutputPane)
    .body.replace(/<[^>]+>/g, "")
    .replace(/&quot;|&#34;/g, '"');

describe("OutputPane render", () => {
  it("renders marks inline with no stray whitespace around them", () => {
    session.output = 'a "Bob" z';
    session.replacements = [replacement(3, 6, "Bob")];
    expect(visibleText()).toContain('a "Bob" z');
  });

  it("keeps multi-byte output aligned", () => {
    session.output = "cześć Łukasz!";
    session.replacements = [replacement(6, 12, "Łukasz")];
    expect(visibleText()).toContain("cześć Łukasz!");
  });

  it("shows the tagline when there is no output", () => {
    session.output = "";
    session.replacements = [];
    expect(visibleText()).toContain("Nothing leaves the woods.");
  });
});
