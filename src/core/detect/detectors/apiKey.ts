import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// Known-prefix secrets only. Generic entropy heuristics create too many false
// positives on hashes and ids — extend this list rather than loosening it.
export const apiKey: StructuralDetector = {
  id: "api-key",
  label: "API key",
  type: "api-key",
  kind: "structural",
  enabled: true,
  match:
    /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[A-Za-z0-9]{24,}|pk_live_[A-Za-z0-9]{24,}|whsec_[A-Za-z0-9]{32,})\b/g,
  keys: /api[-_]?key/i,
  // The vendor prefix is the proof: a match is as certain as a checksum, so
  // it ranks TIER.VALIDATED and an `AWS_ACCESS_KEY_ID=AKIA…` line is not
  // spared by the db-ids preserve rule.
  validate: () => true,
  generate: generators["api-key"],
};
