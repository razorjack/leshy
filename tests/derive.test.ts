import { describe, expect, it } from "vite-plus/test";
import { deriveSeed, nameTokens, normalise } from "../src/core/generate/derive.ts";

describe("normalise", () => {
  it("applies the base transform (NFC, trim, collapse whitespace) to all types", () => {
    expect(normalise("  Acme   Corp  ", "org")).toBe("Acme Corp");
    expect(normalise("10.0.0.5", "ip")).toBe("10.0.0.5");
  });

  it("lowercases emails entirely", () => {
    expect(normalise("  Jan.Kowalski@GMAIL.com ", "email")).toBe("jan.kowalski@gmail.com");
  });

  it("casefolds person names but keeps diacritics", () => {
    expect(normalise("Jan  Kowalski", "person")).toBe("jan kowalski");
    expect(normalise("Łukasz", "person")).toBe("łukasz");
  });

  it("strips separators from digit types (letters kept for IBAN)", () => {
    expect(normalise("+48 601 234 567", "phone")).toBe("48601234567");
    expect(normalise("123-45-6789", "ssn")).toBe("123456789");
    expect(normalise("4111 1111 1111 1111", "credit-card")).toBe("4111111111111111");
    expect(normalise("44051401359", "pesel")).toBe("44051401359");
    expect(normalise("de89 3704 0044 0532 0130 00", "iban")).toBe("DE89370400440532013000");
  });
});

describe("deriveSeed", () => {
  it("is deterministic: same inputs ⇒ same seed", async () => {
    const a = await deriveSeed("leshy-v1", "email", "jan.kowalski@gmail.com");
    const b = await deriveSeed("leshy-v1", "email", "jan.kowalski@gmail.com");
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it("decorrelates on salt", async () => {
    const a = await deriveSeed("salt-a", "email", "jan.kowalski@gmail.com");
    const b = await deriveSeed("salt-b", "email", "jan.kowalski@gmail.com");
    expect(a).not.toBe(b);
  });

  it("decorrelates on scope", async () => {
    const a = await deriveSeed("leshy-v1", "email", "jan.kowalski@gmail.com");
    const b = await deriveSeed("leshy-v1", "email:domain", "jan.kowalski@gmail.com");
    expect(a).not.toBe(b);
  });
});

describe("nameTokens", () => {
  it("splits a name-like local part into the same tokens as the person key", () => {
    expect(nameTokens("jan.kowalski")).toEqual(normalise("Jan Kowalski", "person").split(" "));
    expect(nameTokens("jan.kowalski")).toEqual(["jan", "kowalski"]);
  });

  it("handles other common separators and trailing digits", () => {
    expect(nameTokens("Jan_Kowalski")).toEqual(["jan", "kowalski"]);
    expect(nameTokens("anna-nowak91")).toEqual(["anna", "nowak"]);
  });

  it("returns null when not name-like", () => {
    expect(nameTokens("x9$q")).toBeNull();
    expect(nameTokens("12345")).toBeNull();
  });
});
