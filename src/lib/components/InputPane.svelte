<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
</script>

<!-- TODO(opus): implementation-plan.md step 12 — paste handling (Clipboard
     API), monospace editing surface, char count, clear button. -->
<section class="flex flex-col bg-background">
  <h2 class="px-6 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Paste anything
  </h2>
  <textarea
    class="flex-1 resize-none bg-transparent p-6 font-mono text-sm outline-none"
    placeholder="JSON, Ruby inspect, logs — anything with secrets in it."
    bind:value={session.input}
  ></textarea>
</section>
