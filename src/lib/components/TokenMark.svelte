<script lang="ts">
  import * as Tooltip from './ui/tooltip/index.ts'

  let {
    fake,
    label,
    original,
    onkeep,
  }: { fake: string; label: string; original: string; onkeep?: () => void } = $props()
</script>

<!-- A replaced token: moss-tinted, dotted underline, the detector label on hover
     or keyboard focus (the Trigger is a native button — adr/0005). A click keeps
     the original: the user has the output in front of them and knows better.
     Kept on one whitespace-tight line: any gap between Trigger and the portaled
     Content would render as a stray space in the pre-wrap output. -->
<!-- prettier-ignore -->
<Tooltip.Root><Tooltip.Trigger onclick={onkeep} class="cursor-pointer rounded-xs bg-mark px-0.5 align-baseline text-inherit underline decoration-mark-border decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{fake}</Tooltip.Trigger><Tooltip.Content><span class="font-medium">{label}</span><br /><span class="opacity-80">was <span class="font-mono">{original}</span> · click to keep it</span></Tooltip.Content></Tooltip.Root>
