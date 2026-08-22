/**
 * Core contracts for the Leshy scrubbing engine. Everything in src/core is pure
 * and side-effect free; the UI and the worker are thin shells over these types.
 * See docs/architecture.md and docs/adr/ for the reasoning behind each shape.
 */

/** Built-in entity types. Custom detectors may introduce new string ids. */
export type EntityType =
  | "person"
  | "org"
  | "address"
  | "street"
  | "city"
  | "postcode"
  | "email"
  | "phone"
  | "ip"
  | "mac"
  | "credit-card"
  | "iban"
  | "jwt"
  | "api-key"
  | "uuid"
  | "ssn"
  | "pesel"
  | (string & {});

export type DetectorId = string;

/** Where a span came from. Determines its default precedence tier. */
export type SpanSource = "structural" | "key-context" | "semantic";

/** A detected occurrence of an entity in the raw input text. */
export interface Span {
  /** Char offset into the raw input, inclusive. */
  start: number;
  /** Char offset into the raw input, exclusive. */
  end: number;
  /** Exactly input.slice(start, end). */
  text: string;
  type: EntityType;
  detector: DetectorId;
  source: SpanSource;
  /** Model confidence for semantic spans; 1 for structural and key-context. */
  score: number;
  /** True when the detector's validate() passed — promotes to TIER.VALIDATED. */
  validated?: boolean;
}

/**
 * Precedence tiers (higher wins when spans overlap; losers are trimmed to
 * their uncovered remainder, never silently dropped — see resolve.ts):
 *
 *   500 PRESERVE_FAKE   values in Leshy's own fake namespaces (idempotence)
 *   400 VALIDATED       structural detectors whose validate() passed a checksum
 *   350 PRESERVE_RULE   preserve rules (db ids, timestamps)
 *   300 STRUCTURAL      structural detectors without a validator
 *   200 KEY_CONTEXT     values under a PII-suggesting key
 *   100 SEMANTIC        model spans
 */
export const TIER = {
  PRESERVE_FAKE: 500,
  VALIDATED: 400,
  PRESERVE_RULE: 350,
  STRUCTURAL: 300,
  KEY_CONTEXT: 200,
  SEMANTIC: 100,
} as const;

/** Deterministic helpers handed to generators. All derivation is keyed off the
 * normalised source value + the user salt — nothing is ever stored. */
export interface GenerateContext {
  /** The matched source text. */
  original: string;
  /** normalise(original) — the identity key the fake is derived from. */
  normalized: string;
  /** 32-bit seed derived from (salt, entity type, normalized). Deterministic. */
  seed: number;
  /**
   * Derive an extra seed in a named scope, e.g. seedFor('domain') when an
   * email generator needs independent randomness for the domain part.
   */
  seedFor: (scope: string) => number;
  /**
   * Linked identities: person tokens found inside compound values (an email
   * local part, a username) resolve to the same person seed as the standalone
   * name, so "jan.kowalski@…" and "Jan Kowalski" map to one fake person.
   */
  personSeed: (nameTokens: string[]) => number;
}

/**
 * Produces the replacement for a matched value. Must be deterministic in ctx
 * (same ctx ⇒ same output), must preserve the entity's format, and must not
 * contain quotes, backslashes or newlines (the engine rejects and reseeds).
 */
export type Generate = (ctx: GenerateContext) => string;

export interface DetectorBase {
  /** Short unambiguous id, e.g. 'email', 'pesel'. */
  id: DetectorId;
  /** Human label shown when hovering a replaced token, e.g. 'Email address'. */
  label: string;
  type: EntityType;
  enabled: boolean;
  /**
   * Overrides the source-derived tier. Rarely needed: structural detectors
   * with validate() are promoted to TIER.VALIDATED automatically.
   */
  precedence?: number;
  /**
   * Key-context boost: when a key matching this pattern is found in the input
   * (any of the supported syntaxes — JSON, Ruby, JS, logfmt), its value
   * becomes a span of this detector at TIER.KEY_CONTEXT.
   */
  keys?: RegExp;
  generate: Generate;
}

/** Regex candidates, optionally validated (checksum etc.). */
export interface StructuralDetector extends DetectorBase {
  kind: "structural";
  /** Global regex run over the raw input. */
  match: RegExp;
  /**
   * Rejects false candidates (Luhn, mod-97, PESEL checksum…). A passing
   * validator promotes the span to TIER.VALIDATED unless `heuristic` is set.
   */
  validate?: (candidate: string, input: string, start: number) => boolean;
  /**
   * Set when validate() only makes a candidate plausible (a digit count, a
   * length) instead of proving it. Such a span stays at TIER.STRUCTURAL, so
   * preserve rules still beat it — otherwise a grouped `trace_id` would be
   * scrubbed as a phone number (ADR-0004).
   */
  heuristic?: boolean;
}

/** Zero-shot labels resolved by the GLiNER model. */
export interface SemanticDetector extends DetectorBase {
  kind: "semantic";
  /** Labels passed to the model, e.g. ['person']. First label is canonical. */
  labels: string[];
  /** Per-detector override of config.semantic.threshold. */
  threshold?: number;
}

/**
 * Matched only by `keys` — no text pattern of its own. Address components
 * (`city`, `zip`) have no recognisable shape outside the field that names them.
 */
export interface KeyDetector extends DetectorBase {
  kind: "key";
  keys: RegExp;
}

/** Arbitrary matching logic for cases regex can't express. */
export interface CustomDetector extends DetectorBase {
  kind: "custom";
  match: (input: string) => Array<Pick<Span, "start" | "end" | "text">>;
  validate?: (candidate: string, input: string, start: number) => boolean;
  /** See StructuralDetector.heuristic. */
  heuristic?: boolean;
}

export type Detector = StructuralDetector | SemanticDetector | KeyDetector | CustomDetector;

/**
 * Preserve rules mark ranges that must NOT be scrubbed. They beat key-context
 * and semantic spans, but never a validated structural match (a checksummed
 * PESEL under an `id:` key is still redacted — recall first).
 */
export interface PreserveRule {
  id: string;
  /** Preserve values sitting under keys matching this pattern (`id`, `_id`…). */
  keys?: RegExp;
  /** Preserve raw-text shapes (timestamps, version strings…). */
  match?: RegExp;
  /**
   * Membership test for Leshy's own fake namespaces (TEST-NET IPs, .example
   * emails, future-century PESELs). Runs at TIER.PRESERVE_FAKE so re-scrubbing
   * scrubbed output is a no-op.
   */
  isFake?: (text: string) => boolean;
  enabled: boolean;
}

export interface SemanticConfig {
  /** Model id under /models/. See docs/adr/0001-pii-detection.md. */
  model: string;
  /** Recall/precision dial. Validated default: 0.35. */
  threshold: number;
  /** Zero-shot label set sent to the model in one pass. */
  enabled: boolean;
}

/** Shape of leshy.config.ts. All fields optional; merged over the defaults. */
export interface LeshyConfig {
  /** Custom detectors, appended to the built-ins. */
  detectors?: Detector[];
  /** Built-in detector ids to disable (e.g. 'org'). */
  disable?: DetectorId[];
  /** Off-by-default built-ins to enable (e.g. 'uuid'). */
  enable?: DetectorId[];
  /** Extra preserve rules. */
  preserve?: PreserveRule[];
  /**
   * Salts the real→fake derivation. Default: 'leshy-v1' (reproducible out of
   * the box). Set your own to make your mapping private to you.
   */
  salt?: string;
  semantic?: Partial<SemanticConfig>;
}

/** A single substitution that was applied to produce the output. */
export interface Replacement {
  /** Range in the OUTPUT string (for highlighting). */
  start: number;
  end: number;
  /** Range in the input string it replaced. */
  sourceStart: number;
  sourceEnd: number;
  fake: string;
  type: EntityType;
  detector: DetectorId;
  /** Human label of the detector, for the hover tooltip. */
  label: string;
}

export interface ScrubResult {
  output: string;
  replacements: Replacement[];
}
