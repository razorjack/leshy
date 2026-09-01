import { describe, expect, it } from "vite-plus/test";
import { render } from "svelte/server";
import { session } from "../src/state/session.svelte.ts";
import InputPane from "../src/lib/components/InputPane.svelte";
import type { Replacement } from "../src/core/types.ts";

const replacement = (sourceStart: number, sourceEnd: number): Replacement => ({
  start: 0,
  end: 0,
  sourceStart,
  sourceEnd,
  fake: "Ala Nowak",
  type: "person",
  detector: "person",
  label: "Person name",
});

/** The mirror is the only aria-hidden block, and the only source of <mark>s. */
const mirror = (): string => {
  const body = render(InputPane).body;
  const inner = /aria-hidden="true"[^>]*>([\s\S]*?)<\/div>/.exec(body);
  return inner?.[1] ?? "";
};

const marked = (): string[] =>
  [...mirror().matchAll(/<mark[^>]*>([\s\S]*?)<\/mark>/g)].map((match) => match[1] ?? "");

const text = (): string => mirror().replace(/<[^>]+>/g, "");

describe("InputPane mirror", () => {
  it("marks the replaced values and repeats the input verbatim", () => {
    session.input = "user Jan Kowalski logged in";
    session.scrubbedFrom = session.input;
    session.replacements = [replacement(5, 17)];
    expect(marked()).toEqual(["Jan Kowalski"]);
    // the trailing newline is the empty last line every textarea keeps
    expect(text()).toBe(session.input + "\n");
  });

  it("keeps multi-byte values aligned", () => {
    session.input = "cześć Łukasz!";
    session.scrubbedFrom = session.input;
    session.replacements = [replacement(6, 12)];
    expect(marked()).toEqual(["Łukasz"]);
  });

  it("drops the marks once the input has moved past the scrub they came from", () => {
    session.input = "user Jan Kowalski logged in";
    session.scrubbedFrom = session.input;
    session.replacements = [replacement(5, 17)];
    session.input = "user Jan";
    expect(marked()).toEqual([]);
    expect(text()).toBe("user Jan\n");
  });
});
