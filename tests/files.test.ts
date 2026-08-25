import { describe, expect, it } from "vite-plus/test";
import { scrubbedName } from "../src/lib/files.ts";

describe("scrubbed file name", () => {
  it("keeps the extension and marks the file as scrubbed", () => {
    expect(scrubbedName("app.log")).toBe("app.scrubbed.log");
    expect(scrubbedName("dump")).toBe("dump.scrubbed.txt");
    expect(scrubbedName(".env")).toBe(".env.scrubbed.txt");
    expect(scrubbedName(undefined)).toBe("scrubbed.txt");
  });
});
