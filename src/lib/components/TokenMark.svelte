<script lang="ts">
  let { fake, label }: { fake: string; label: string } = $props()
</script>

<!-- A replaced token: moss-tinted, dotted underline, entity type on hover.
     TODO(opus): implementation-plan.md step 13 — swap title for a proper
     tooltip (shadcn-svelte tooltip) once wired. -->
<mark class="rounded-xs bg-mark px-0.5 text-inherit underline decoration-mark-border decoration-dotted underline-offset-2" title={label}>
  {fake}
</mark>
