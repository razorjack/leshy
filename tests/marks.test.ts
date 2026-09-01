import { describe, expect, it } from "vite-plus/test";
import { markClass, markGroup } from "../src/lib/marks.ts";
import { resolveConfig } from "../src/core/config.ts";

describe("mark groups", () => {
  it("every built-in type has a group of its own", () => {
    for (const detector of resolveConfig().detectors) {
      expect(markGroup(detector.type)).not.toBe("other");
    }
  });

  it("custom types fall back to the neutral mark", () => {
    expect(markClass("nip")).toBe("mark-other");
  });
});
