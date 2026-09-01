import { defineConfig } from "./src/core/config.ts";

/**
 * User-facing detector configuration. This file is imported by the detection
 * worker at build time, so custom detectors can carry real functions.
 *
 * Worked example — a custom detector, a toggle and a preserve rule (see
 * CLAUDE.md "Extending detection"):
 *
 *   export default defineConfig({
 *     enable: ['uuid'],
 *     detectors: [
 *       {
 *         id: 'nip',
 *         label: 'NIP (PL tax id)',
 *         type: 'nip',
 *         kind: 'structural',
 *         enabled: true,
 *         match: /(?<!\d)\d{10}(?!\d)/g,
 *         keys: /^nip$/i,
 *         validate: (nip) => nipChecksum(nip),
 *         generate: (context) => fakeNip(context.seed),
 *       },
 *     ],
 *     preserve: [{ id: 'build-hashes', keys: /^commit|sha$/i, enabled: true }],
 *   })
 */
export default defineConfig({});
