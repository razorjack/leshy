import type { ScrubResult } from "../core/types.ts";
import type { ConfigOverrides } from "../core/config.ts";

/**
 * Worker boundary. Detection (model included) runs in the Web Worker; the UI
 * thread only ever sends raw text and receives results. Custom detectors from
 * leshy.config.ts contain functions, so the config is statically imported BY
 * the worker bundle — only serialisable overrides cross this boundary.
 */

export type ScrubOverrides = ConfigOverrides;

export type WorkerRequest =
  | { id: number; kind: "warmup" }
  | { id: number; kind: "scrub"; input: string; overrides?: ScrubOverrides };

export type WorkerStage = "loading-model" | "detecting";

export type WorkerResponse =
  | { id: number; kind: "ready" }
  | { id: number; kind: "progress"; stage: WorkerStage }
  /** `warning` is set when the model could not load and only the rule-based layers ran. */
  | { id: number; kind: "result"; result: ScrubResult; warning?: string }
  | { id: number; kind: "error"; message: string };
