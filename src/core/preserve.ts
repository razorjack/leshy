import type { PreserveRule } from "./types.ts";
import { isFakePesel } from "./detect/detectors/pesel.ts";

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|\s?[+-]\d{2}:?\d{2})?)?$/;

// RFC 5737 TEST-NET ranges — Leshy's fake namespace for public IPv4s.
const TEST_NET = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;

// RFC 2606 reserved TLD — Leshy's fake namespace for emails and hostnames.
const EXAMPLE_TLD = /\.example$/i;

/**
 * Default preserve rules. `db-ids` and `timestamps` protect debugging value
 * (TIER.PRESERVE_RULE — a validated checksum still beats them). The `fake-*`
 * rules make scrubbing idempotent (TIER.PRESERVE_FAKE): Leshy's own fakes are
 * drawn from reserved namespaces no real value can occupy, so a second pass
 * recognises and keeps them. See docs/adr/0004-preserve-vs-redact.md.
 */
export const defaultPreserve: PreserveRule[] = [
  {
    id: "db-ids",
    keys: /(?:^|_)(?:id|uuid|guid)$/i,
    enabled: true,
  },
  {
    id: "timestamps",
    keys: /(?:^|_)(?:created|updated|deleted)_?(?:at|on)$|timestamp/i,
    match: TIMESTAMP,
    enabled: true,
  },
  {
    id: "fake-email",
    isFake: (text) => text.includes("@") && EXAMPLE_TLD.test(text),
    enabled: true,
  },
  {
    id: "fake-ip",
    isFake: (text) => TEST_NET.test(text),
    enabled: true,
  },
  {
    id: "fake-pesel",
    isFake: (text) => /^\d{11}$/.test(text) && isFakePesel(text),
    enabled: true,
  },
  {
    id: "fake-ssn",
    // Leshy generates SSN fakes with group "00", which is never issued.
    isFake: (text) => /^\d{3}-00-\d{4}$/.test(text),
    enabled: true,
  },
];
