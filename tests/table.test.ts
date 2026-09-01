import { describe, expect, it } from "vite-plus/test";
import { tabulate } from "../src/lib/table.ts";
import type { Replacement } from "../src/core/types.ts";

const replacement = (
  sourceStart: number,
  sourceEnd: number,
  fake: string,
  type = "ip",
  label = "IPv4 address",
): Replacement => ({ start: 0, end: 0, sourceStart, sourceEnd, fake, type, detector: type, label });

const input = "10.0.0.5 jan@corp.io 10.0.0.5";
const replacements = [
  replacement(0, 8, "10.1.1.1"),
  replacement(9, 20, "x@y.example", "email", "Email address"),
  replacement(21, 29, "10.1.1.1"),
];

describe("replacements table", () => {
  it("groups repeats into one row with a count", () => {
    const rows = tabulate(input, replacements, {
      filter: "",
      sortBy: "count",
      descending: true,
    });
    expect(rows.map((row) => [row.original, row.count])).toEqual([
      ["10.0.0.5", 2],
      ["jan@corp.io", 1],
    ]);
  });

  it("filters on original, fake and type label, case-insensitively", () => {
    const view = { sortBy: "original" as const, descending: false };
    expect(tabulate(input, replacements, { ...view, filter: "CORP" })).toHaveLength(1);
    expect(tabulate(input, replacements, { ...view, filter: "example" })).toHaveLength(1);
    expect(tabulate(input, replacements, { ...view, filter: "ipv4" })).toHaveLength(1);
    expect(tabulate(input, replacements, { ...view, filter: "zzz" })).toHaveLength(0);
  });

  it("sorts by any column in either direction", () => {
    const ascending = tabulate(input, replacements, {
      filter: "",
      sortBy: "fake",
      descending: false,
    });
    expect(ascending.map((row) => row.fake)).toEqual(["10.1.1.1", "x@y.example"]);
    const descending = tabulate(input, replacements, {
      filter: "",
      sortBy: "fake",
      descending: true,
    });
    expect(descending.map((row) => row.fake)).toEqual(["x@y.example", "10.1.1.1"]);
  });
});
