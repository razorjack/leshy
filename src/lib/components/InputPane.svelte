<script lang="ts">
  import { session } from '../../state/session.svelte.ts'

  // A paste scrubs immediately; typing is debounced. `onpaste` fires before the
  // value updates, so flag it and let the following `oninput` run immediately.
  let pasted = false
</script>

<section class="flex flex-col bg-background">
  <h2 class="px-6 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Paste anything
  </h2>
  <textarea
    class="flex-1 resize-none bg-transparent p-6 font-mono text-sm outline-none"
    placeholder="JSON, Ruby inspect, logs — anything with secrets in it."
    value={session.input}
    onpaste={() => (pasted = true)}
    oninput={(e) => {
      session.setInput(e.currentTarget.value, pasted)
      pasted = false
    }}
  ></textarea>
</section>
