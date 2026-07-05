<script lang="ts">
  import * as Tooltip from './ui/tooltip/index.ts'

  let { fake, label }: { fake: string; label: string } = $props()
</script>

<!-- A replaced token: moss-tinted, dotted underline, the detector label on hover
     or keyboard focus (the Trigger is a native button — adr/0005). Kept on one
     whitespace-tight line: any gap between Trigger and the portaled Content would
     render as a stray space in the pre-wrap output. -->
<!-- prettier-ignore -->
<Tooltip.Root><Tooltip.Trigger class="cursor-help rounded-xs bg-mark px-0.5 align-baseline text-inherit underline decoration-mark-border decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{fake}</Tooltip.Trigger><Tooltip.Content>{label}</Tooltip.Content></Tooltip.Root>
