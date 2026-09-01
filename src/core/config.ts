import type {
  Detector,
  KeyDetector,
  LeshyConfig,
  LocaleSetting,
  PreserveRule,
  SemanticConfig,
  StructuralDetector,
} from "./types.ts";
import { builtins } from "./detect/detectors/index.ts";
import { packs } from "./packs/index.ts";
import { defaultPreserve } from "./preserve.ts";
import { DEFAULT_MODEL } from "./detect/semantic/models.ts";
import { generators } from "./generate/generators.ts";

/** Fixed default so behaviour is reproducible out of the box (adr/0002). */
export const DEFAULT_SALT = "leshy-v1";

/** Recall/precision dial validated in the spike (adr/0001). */
export const DEFAULT_THRESHOLD = 0.35;

export const defineConfig = (config: LeshyConfig): LeshyConfig => config;

export interface ResolvedConfig {
  /** Ids of the country packs whose detectors are in `detectors`. */
  countries: string[];
  detectors: Detector[];
  preserve: PreserveRule[];
  salt: string;
  locale: LocaleSetting;
  semantic: SemanticConfig;
  /** Values the user chose to leave verbatim, whatever detected them. */
  keep: string[];
}

/** The fakes a rule written in the UI can pick from: every built-in generator. */
export type FakeType = keyof typeof generators;

export const fakeTypes = Object.keys(generators) as FakeType[];

/**
 * A detector written in the settings dialog. Regexes travel as source text
 * (no flags: `pattern` runs global, `keys` case-insensitive) and become a
 * structural or key detector in resolveConfig. At least one of the two is set.
 */
export interface CustomRule {
  id: string;
  label: string;
  pattern?: string;
  keys?: string;
  type: FakeType;
  enabled: boolean;
}

/** A preserve rule written in the settings dialog; same shape as PreserveRule. */
export interface KeepRule {
  id: string;
  label: string;
  keys?: string;
  match?: string;
  enabled: boolean;
}

const toDetector = (rule: CustomRule): Detector => {
  const base = {
    id: rule.id,
    label: rule.label,
    type: rule.type,
    enabled: rule.enabled,
    generate: generators[rule.type],
  };
  const keys = rule.keys ? new RegExp(rule.keys, "i") : undefined;

  if (rule.pattern) {
    const detector: StructuralDetector = {
      ...base,
      kind: "structural",
      match: new RegExp(rule.pattern, "g"),
    };
    if (keys) detector.keys = keys;
    return detector;
  }

  const detector: KeyDetector = {
    ...base,
    kind: "key",
    keys: keys ?? new RegExp("(?!)", "i"),
  };
  return detector;
};

const toPreserve = (rule: KeepRule): PreserveRule => {
  const preserveRule: PreserveRule = { id: rule.id, enabled: rule.enabled };
  if (rule.keys) preserveRule.keys = new RegExp(rule.keys, "i");
  if (rule.match) preserveRule.match = new RegExp(rule.match);
  return preserveRule;
};

/**
 * Serialisable adjustments a UI applies over the code-defined config. Only
 * data crosses the worker boundary, so nothing here can carry a function.
 */
export interface ConfigOverrides {
  /** Detector ids toggled, applied over `LeshyConfig.disable`/`enable`. */
  disable?: string[];
  enable?: string[];
  /** Country pack ids selected (adr/0008). */
  countries?: string[];
  locale?: LocaleSetting;
  salt?: string;
  semanticEnabled?: boolean;
  /** Exact values to leave verbatim: a click on a mark says "not this one". */
  keep?: string[];
  /** Rules written in the UI, appended after the code-defined ones. */
  rules?: CustomRule[];
  keepRules?: KeepRule[];
}

// A toggle in the UI is the later decision, so it wins over the config's lists.
const applyOverrides = (config: LeshyConfig, overrides: ConfigOverrides): LeshyConfig => {
  const disable = (config.disable ?? []).filter((id) => !overrides.enable?.includes(id));
  disable.push(...(overrides.disable ?? []));

  const enable = (config.enable ?? []).filter((id) => !overrides.disable?.includes(id));
  enable.push(...(overrides.enable ?? []));

  const semantic = { ...config.semantic };
  if (overrides.semanticEnabled !== undefined) semantic.enabled = overrides.semanticEnabled;

  return {
    ...config,
    disable,
    enable,
    countries: overrides.countries ?? config.countries,
    locale: overrides.locale ?? config.locale,
    salt: overrides.salt ?? config.salt,
    semantic,
  };
};

const selectPacks = (countries: string[] | undefined): typeof packs => {
  if (countries === undefined) return packs;
  return packs.filter((pack) => countries.includes(pack.id));
};

const applyDetectorToggles = (
  detectors: Detector[],
  disabledIds: Set<string>,
  enabledIds: Set<string>,
): Detector[] =>
  detectors.map((detector) => {
    if (disabledIds.has(detector.id)) return { ...detector, enabled: false };
    if (enabledIds.has(detector.id)) return { ...detector, enabled: true };
    return detector;
  });

export const resolveConfig = (
  base: LeshyConfig = {},
  overrides?: ConfigOverrides,
): ResolvedConfig => {
  const config = overrides ? applyOverrides(base, overrides) : base;
  const disabledIds = new Set(config.disable ?? []);
  const enabledIds = new Set(config.enable ?? []);
  const selectedPacks = selectPacks(config.countries);

  // Packs first: their national-id checksums are the most specific rules in the
  // list, and declaration order breaks equal-tier ties (adr/0004).
  const configuredDetectors = [
    ...selectedPacks.flatMap((pack) => pack.detectors),
    ...builtins,
    ...(config.detectors ?? []),
    ...(overrides?.rules ?? []).map(toDetector),
  ];
  const detectors = applyDetectorToggles(configuredDetectors, disabledIds, enabledIds);
  const preserve = [
    ...defaultPreserve,
    ...selectedPacks.flatMap((pack) => pack.preserve ?? []),
    ...(config.preserve ?? []),
    ...(overrides?.keepRules ?? []).map(toPreserve),
  ];

  return {
    countries: selectedPacks.map((pack) => pack.id),
    detectors,
    preserve,
    salt: config.salt ?? DEFAULT_SALT,
    locale: config.locale ?? "auto",
    keep: overrides?.keep ?? [],
    semantic: {
      model: DEFAULT_MODEL,
      threshold: DEFAULT_THRESHOLD,
      enabled: true,
      ...config.semantic,
    },
  };
};
