import type { Detector, SemanticDetector, Span } from "../../types.ts";
import type { Gliner } from "./gliner/runtime.ts";

/**
 * One model pass resolves all enabled semantic detectors: their zero-shot
 * labels are sent together, and each returned entity maps back to the detector
 * that owns its label. Per-detector thresholds are applied after the pass.
 */
export const detectSemantic = async (
  input: string,
  detectors: Detector[],
  gliner: Gliner,
  defaultThreshold: number,
): Promise<Span[]> => {
  const semantic = detectors.filter(
    (d): d is SemanticDetector => d.kind === "semantic" && d.enabled,
  );
  if (semantic.length === 0 || input.trim() === "") return [];

  const labelOwner = new Map<string, SemanticDetector>();
  for (const d of semantic) {
    for (const label of d.labels) {
      if (!labelOwner.has(label)) labelOwner.set(label, d);
    }
  }
  const thresholds = semantic.map((d) => d.threshold ?? defaultThreshold);
  const floor = Math.min(...thresholds);

  const entities = await gliner.extractEntities(input, [...labelOwner.keys()], {
    threshold: floor,
  });

  const spans: Span[] = [];
  for (const e of entities) {
    const owner = labelOwner.get(e.label);
    if (!owner || e.score < (owner.threshold ?? defaultThreshold)) continue;
    spans.push({
      start: e.start,
      end: e.end,
      text: e.text,
      type: owner.type,
      detector: owner.id,
      source: "semantic",
      score: e.score,
    });
  }
  return spans;
};
