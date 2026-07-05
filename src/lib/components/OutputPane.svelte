<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
  import TokenMark from './TokenMark.svelte'
</script>

<!-- TODO(opus): implementation-plan.md step 13 — render session.output split
     around session.replacements as text + <TokenMark> runs; copy button
     writes the raw output string via navigator.clipboard.writeText. -->
<section class="flex flex-col bg-background">
  <h2 class="px-6 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Scrubbed
  </h2>
  <div class="flex-1 overflow-auto whitespace-pre-wrap p-6 font-mono text-sm">
    {#if session.replacements.length > 0}
      <TokenMark fake="preview" label="Person name" />
    {:else}
      <span class="text-muted-foreground">{session.output || 'Output appears here.'}</span>
    {/if}
  </div>
</section>
