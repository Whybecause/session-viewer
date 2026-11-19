import type { MessageKey } from "./i18n.ts";

type Preset = readonly [icon: string, label: MessageKey];

export const ICON_GROUPS: readonly { title: MessageKey; presets: readonly Preset[] }[] = [
  {
    title: "icons.group.vocalsAndWinds",
    presets: [
      ["🎤", "icons.preset.vocals"],
      ["🎷", "icons.preset.saxophone"],
      ["🎺", "icons.preset.brass"],
    ],
  },
  {
    title: "icons.group.strings",
    presets: [
      ["🐋", "icons.preset.bass"],
      ["🎸", "icons.preset.guitar"],
      ["🪕", "icons.preset.banjo"],
      ["🎻", "icons.preset.strings"],
    ],
  },
  {
    title: "icons.group.keysAndSynths",
    presets: [
      ["🎹", "icons.preset.piano"],
      ["🎛️", "icons.preset.synthPad"],
      ["📈", "icons.preset.synthLead"],
    ],
  },
  {
    title: "icons.group.rhythm",
    presets: [
      ["🥁", "icons.preset.drums"],
      ["⭕", "icons.preset.snare"],
      ["🪘", "icons.preset.percussion"],
      ["👏", "icons.preset.claps"],
    ],
  },
  {
    title: "icons.group.others",
    presets: [
      ["🎼", "icons.preset.score"],
      ["🔁", "icons.preset.loop"],
      ["🌊", "icons.preset.pad"],
      ["⚡", "icons.preset.effect"],
      ["✨", "icons.preset.texture"],
      ["🔊", "icons.preset.soundSystem"],
      ["🎧", "icons.preset.monitor"],
      ["🎵", "icons.preset.melody"],
      ["🔔", "icons.preset.bell"],
    ],
  },
];

export const ICON_PRESETS: readonly Preset[] = ICON_GROUPS.flatMap((group) => group.presets);
