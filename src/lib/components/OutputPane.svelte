<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
  import { splitOutput } from '../segments.ts'
  import TokenMark from './TokenMark.svelte'
  import { Button } from './ui/button/index.ts'
  import * as Tooltip from './ui/tooltip/index.ts'

  // A fake becomes a <TokenMark>; everything else is verbatim text (see splitOutput).
  const segments = $derived(splitOutput(session.output, session.replacements))
  const hasOutput = $derived(session.output.length > 0)

  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(session.output)
    copied = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied = false), 1600)
  }
</script>

<section class="flex min-h-0 flex-col bg-background">
  <div class="flex items-center justify-between px-6 pt-4">
    <h2 class="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scrubbed</h2>
    {#if hasOutput}
      <Button variant="ghost" size="sm" class="-my-1 h-7 text-xs" onclick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    {/if}
  </div>
  <div class="flex-1 overflow-auto p-6 font-mono text-sm">
    {#if hasOutput}
      <Tooltip.Provider delayDuration={200}>
        <!-- prettier-ignore -->
        <div class="whitespace-pre-wrap break-words"
          >{#each segments as seg}{#if seg.kind === 'text'}{seg.text}{:else}<TokenMark
                fake={seg.rep.fake}
                label={seg.rep.label}
              />{/if}{/each}</div>
      </Tooltip.Provider>
    {:else if session.error}
      <span class="text-destructive">{session.error}</span>
    {:else}
      <span class="text-muted-foreground">Nothing leaves the woods.</span>
    {/if}
  </div>
</section>
