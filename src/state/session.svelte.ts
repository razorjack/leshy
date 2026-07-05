import type { Replacement } from "../core/types.ts";

export type SessionStage = "idle" | "loading-model" | "working" | "done" | "error";

/**
 * TODO(opus): docs/implementation-plan.md step 12 — own the ScrubWorker
 * lifecycle here (lazy-create on first input, warmup on idle, debounce ~150ms,
 * cancel superseded requests by ignoring stale ids).
 */
class Session {
  input = $state("");
  output = $state("");
  replacements = $state<Replacement[]>([]);
  stage = $state<SessionStage>("idle");
  error = $state<string | undefined>(undefined);
}

export const session = new Session();
