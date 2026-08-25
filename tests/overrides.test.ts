import { describe, expect, it } from "vite-plus/test";
import { scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";

// These are the config effects the settings dialog drives through ScrubOverrides.
describe("config overrides", () => {
  const input = "email jan.kowalski@gmail.com";

  it("disabling a detector leaves its values intact", async () => {
    const r = await scrub(input, { config: resolveConfig({ disable: ["email"] }) });
    expect(r.output).toBe(input);
  });

  it("a custom salt changes the fake deterministically", async () => {
    const base = await scrub(input, { config: resolveConfig() });
    const salted1 = await scrub(input, { config: resolveConfig({ salt: "custom" }) });
    const salted2 = await scrub(input, { config: resolveConfig({ salt: "custom" }) });
    expect(salted1.output).not.toBe(base.output);
    expect(salted1.output).toBe(salted2.output); // deterministic per salt
  });

  it("deselecting a country takes its rules out", async () => {
    const doc = '{"pesel":"44051401359"}';
    expect((await scrub(doc, { config: resolveConfig() })).output).not.toBe(doc);
    expect((await scrub(doc, { config: resolveConfig({ countries: ["us"] }) })).output).toBe(doc);
  });

  it("a locale changes the fakes without changing what is detected", async () => {
    const base = await scrub(input, { config: resolveConfig() });
    const de = await scrub(input, { config: resolveConfig({ locale: "de" }) });
    expect(de.output).not.toBe(base.output);
    expect(de.replacements.length).toBe(base.replacements.length);
  });

  it("a match-only preserve rule spares spans of that shape", async () => {
    const doc = "build 10.2.3.4 host 10.2.3.5";
    const config = resolveConfig({
      preserve: [{ id: "versions", match: /^10\.2\.3\.4$/, enabled: true }],
    });
    const r = await scrub(doc, { config });
    expect(r.output).toContain("10.2.3.4");
    expect(r.output).not.toContain("10.2.3.5");
  });

  it("enabling an off-by-default detector activates it (uuid)", async () => {
    const withUuid = await scrub("id 123e4567-e89b-42d3-a456-426614174000", {
      config: resolveConfig({ enable: ["uuid"] }),
    });
    expect(withUuid.output).not.toContain("123e4567-e89b-42d3-a456-426614174000");
  });
});
