/**
 * Copy state shared by the button and the keyboard shortcut, so both show the
 * same "Copied" feedback. The Clipboard API rejects when the permission is
 * denied or the document is not focused; say so instead of failing silently.
 */
class Clipboard {
  state = $state<"idle" | "copied" | "failed">("idle");
  private timer: ReturnType<typeof setTimeout> | undefined;

  async copy(text: string): Promise<boolean> {
    let copied: boolean;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    this.state = copied ? "copied" : "failed";
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.state = "idle"), 1600);
    return copied;
  }
}

export const clipboard = new Clipboard();
