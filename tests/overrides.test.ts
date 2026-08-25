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

  it("a UI toggle wins over the config's own disable list", async () => {
    const config = resolveConfig({ disable: ["email"] }, { enable: ["email"] });
    expect((await scrub(input, { config })).output).not.toBe(input);
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

  it("a kept value stays verbatim even when a checksum proved it", async () => {
    const doc = '{"pesel":"44051401359","email":"jan.kowalski@gmail.com"}';
    const config = resolveConfig({}, { keep: ["44051401359"] });
    const r = await scrub(doc, { config });
    expect(r.output).toContain("44051401359");
    expect(r.output).not.toContain("jan.kowalski@gmail.com");
  });

  it("a rule written in the UI runs as a structural or key detector", async () => {
    const config = resolveConfig(
      {},
      {
        rules: [
          { id: "r1", label: "Ticket", pattern: "\\bTKT-\\d{6}\\b", type: "secret", enabled: true },
          { id: "r2", label: "Badge", keys: "^badge_no$", type: "secret", enabled: true },
          { id: "r3", label: "Off", pattern: "\\bOFF-\\d+\\b", type: "secret", enabled: false },
        ],
      },
    );
    const r = await scrub("TKT-123456 badge_no=A77 OFF-1", { config });
    expect(r.output).toMatch(/^[A-Z]{3}-\d{6} badge_no=[A-Z]\d{2} OFF-1$/);
    expect(r.output).not.toBe("TKT-123456 badge_no=A77 OFF-1");
    expect(r.replacements.map((x) => x.label)).toEqual(["Ticket", "Badge"]);
  });

  it("a keep rule written in the UI spares values under its keys", async () => {
    const config = resolveConfig(
      {},
      { keepRules: [{ id: "k1", label: "Support mailbox", keys: "^support$", enabled: true }] },
    );
    const r = await scrub("support=help@corp.io from=jan@corp.io", { config });
    expect(r.output).toContain("help@corp.io");
    expect(r.output).not.toContain("jan@corp.io");
  });

  it("enabling an off-by-default detector activates it (uuid)", async () => {
    const withUuid = await scrub("id 123e4567-e89b-42d3-a456-426614174000", {
      config: resolveConfig({ enable: ["uuid"] }),
    });
    expect(withUuid.output).not.toContain("123e4567-e89b-42d3-a456-426614174000");
  });
});
