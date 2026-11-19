<script lang="ts">
  import { t } from "./lib/i18n.ts";
  import type { TrackSpan } from "../../server/protocol.ts";
  import Select, { type Choice } from "./Select.svelte";

  let {
    span,
    label,
    trackNames,
    onchange,
  }: {
    span: TrackSpan;
    /** Prefix of what a screen reader calls each field: "Onglet de ALEX". */
    label: string;
    trackNames: readonly string[];
    onchange: (span: TrackSpan) => void;
  } = $props();

  const tracks: Choice[] = $derived(trackNames.map((name) => ({ value: name, label: name })));
  const isMissing = (name: string) => !trackNames.includes(name);
  // A bound that left the set stays selectable, flagged, so the control never shows a value that is not in its list.
  const tracksWith = (name: string): Choice[] => (isMissing(name) ? [{ value: name, label: t("musician.trackNotFound", { name }) }, ...tracks] : tracks);
</script>

<div class="fields">
  {#each [["first", "musician.firstTrack", "musician.firstTrackField"], ["last", "musician.lastTrack", "musician.lastTrackField"]] as const as [bound, captionKey, fieldKey] (bound)}
    <div class="field">
      <span class="caption">{t(captionKey)}</span>
      <Select
        label={t(fieldKey, { label })}
        options={tracksWith(span[bound])}
        value={span[bound]}
        invalid={isMissing(span[bound])}
        onchange={(name) => onchange({ ...span, [bound]: name })}
      />
    </div>
  {/each}
</div>

<style>
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .caption {
    padding-left: 2px;
    color: var(--muted);
    font-size: 12px;
  }
  .field :global(.trigger) {
    height: 44px;
    background: var(--bg);
  }
</style>
