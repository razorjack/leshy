import type { ScrubResult } from "../core/types.ts";
import type { ScrubOverrides, WorkerRequest, WorkerResponse, WorkerStage } from "./protocol.ts";

/** Typed RPC over postMessage — the platform needs no library for this. */
export class ScrubWorker {
  private readonly worker: Worker;
  private nextId = 1;
  private lastScrubId: number | undefined;
  private readonly pending = new Map<
    number,
    { resolve: (r: ScrubResult) => void; reject: (e: Error) => void }
  >();

  onStage: ((stage: WorkerStage) => void) | undefined;

  constructor() {
    this.worker = new Worker(new URL("./detect.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.kind === "progress") {
        this.onStage?.(msg.stage);
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      if (msg.kind === "result") {
        this.pending.delete(msg.id);
        entry.resolve(msg.result);
      } else if (msg.kind === "error") {
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.message));
      }
    });
  }

  /** Starts model download/initialisation without blocking first paint. */
  warmup(): void {
    this.post({ id: this.nextId++, kind: "warmup" });
  }

  /**
   * Settle the outstanding scrub promise. The worker coalesces to the latest
   * request and never replies to a dropped one, so an unsettled promise would
   * hold its caller's continuation for the lifetime of the page.
   */
  cancel(): void {
    if (this.lastScrubId === undefined) return;
    const prev = this.pending.get(this.lastScrubId);
    this.pending.delete(this.lastScrubId);
    this.lastScrubId = undefined;
    prev?.reject(new Error("superseded"));
  }

  scrub(input: string, overrides?: ScrubOverrides): Promise<ScrubResult> {
    this.cancel();
    const id = this.nextId++;
    this.lastScrubId = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ id, kind: "scrub", input, overrides });
    });
  }

  terminate(): void {
    this.worker.terminate();
  }

  private post(msg: WorkerRequest): void {
    this.worker.postMessage(msg);
  }
}
