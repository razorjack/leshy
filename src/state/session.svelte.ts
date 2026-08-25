import type { Replacement } from "../core/types.ts";
import { ScrubWorker } from "../worker/client.ts";
import type { ScrubOverrides } from "../worker/protocol.ts";

export type SessionStage = "idle" | "loading-model" | "working" | "done" | "error";

const DEBOUNCE_MS = 150;

/**
 * Owns the ScrubWorker lifecycle. The worker (and its ~180 MB model) is created
 * lazily on the first real input and warmed up immediately. Typing is debounced;
 * a paste scrubs immediately. Every scrub supersedes the previous one (the
 * client cancels it and the worker coalesces to the latest), so a burst of input
 * yields exactly one final result and never overlaps inference.
 */
class Session {
  input = $state("");
  output = $state("");
  replacements = $state<Replacement[]>([]);
  /**
   * The input `output` and `replacements` were produced from. While it differs
   * from `input` the source ranges no longer index what the user sees.
   */
  scrubbedFrom = $state("");
  stage = $state<SessionStage>("idle");
  error = $state<string | undefined>(undefined);
  /** The last result was produced without the model (it failed to load). */
  warning = $state<string | undefined>(undefined);
  /** Values the user clicked to leave verbatim. Session-only, never stored. */
  kept = $state<string[]>([]);
  /** Name of the file the input came from, when it was opened rather than pasted. */
  fileName = $state<string | undefined>(undefined);

  private overrides: ScrubOverrides = {};
  private worker: ScrubWorker | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private token = 0;

  private ensureWorker(): ScrubWorker {
    if (!this.worker) {
      this.worker = new ScrubWorker();
      // A progress message only matters while a run is in flight; a stale one
      // must not revive the indicator after the input was cleared.
      this.worker.onStage = (stage) => {
        if (this.stage === "working" || this.stage === "loading-model") {
          this.stage = stage === "loading-model" ? "loading-model" : "working";
        }
      };
      this.worker.warmup();
    }
    return this.worker;
  }

  /** Called from the input surface. Typing debounces; a paste runs immediately. */
  setInput(value: string, immediate = false): void {
    this.input = value;
    if (this.timer) clearTimeout(this.timer);
    if (value.trim() === "") {
      this.token++; // cancel any in-flight response
      this.worker?.cancel(); // …and settle its promise
      this.output = "";
      this.replacements = [];
      this.scrubbedFrom = "";
      this.stage = "idle";
      this.error = undefined;
      this.warning = undefined;
      this.fileName = undefined;
      return;
    }
    this.ensureWorker();
    if (immediate) {
      void this.run(value);
    } else {
      this.timer = setTimeout(() => void this.run(value), DEBOUNCE_MS);
    }
  }

  /** A dropped or opened file: read in full, scrubbed immediately. */
  async openFile(file: File): Promise<void> {
    const text = await file.text();
    this.fileName = file.name;
    this.setInput(text, true);
  }

  /** Settings changes: re-scrub the current input immediately with new overrides. */
  setOverrides(overrides: ScrubOverrides): void {
    // Snapshot first: the settings dialog holds its lists in $state, and a
    // proxy fails structured cloning the moment postMessage tries to send it.
    this.overrides = $state.snapshot(overrides);
    if (this.input.trim() !== "") void this.run(this.input);
  }

  keep(value: string): void {
    if (this.kept.includes(value)) return;
    this.kept = [...this.kept, value];
    void this.run(this.input);
  }

  restore(value: string): void {
    this.kept = this.kept.filter((v) => v !== value);
    if (this.input.trim() !== "") void this.run(this.input);
  }

  private async run(value: string): Promise<void> {
    const worker = this.ensureWorker();
    const token = ++this.token;
    this.error = undefined;
    this.stage = "working";
    try {
      const overrides = { ...this.overrides, keep: $state.snapshot(this.kept) };
      const result = await worker.scrub(value, overrides);
      if (token !== this.token) return; // superseded by a newer request
      this.output = result.output;
      this.replacements = result.replacements;
      this.scrubbedFrom = value;
      this.warning = result.warning;
      this.stage = "done";
    } catch (e) {
      if (token !== this.token) return; // superseded — its rejection is expected
      this.error = e instanceof Error ? e.message : String(e);
      this.stage = "error";
    }
  }
}

export const session = new Session();
