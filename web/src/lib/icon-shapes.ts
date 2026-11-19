/**
 * Line drawings (24x24, stroke only) for the preset icons. Icons stay stored as the emoji they replace, so a custom
 * emoji and every saved file keep working: an emoji with a drawing here is drawn, any other is shown as text.
 * Guitar, piano, synth keyboard and drum come from Lucide (ISC licence, © Lucide Icons and Contributors).
 */
const SHAPES: Readonly<Record<string, string>> = {
  "🎤": "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M6 11a6 6 0 0 0 12 0 M12 17v4 M9 21h6",
  "🎷": "M7 3h4 M9 3v13a5 5 0 0 0 10 0v-3 M16 13h6 M9 8h2 M9 12h2",
  "🎸": "M11.9 12.1 4.514-4.514 M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z M6 16 2 2 M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z",
  "🪕": "M12 11a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z M12 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M12 11V3 M10.5 3h3 M12 6.5h.01",
  "🥁": "M12 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 16h.01 M3 8c0-.7 1.6-1.3 3.5-1.3S10 7.3 10 8v2.5c0 .7-1.6 1.3-3.5 1.3S3 11.2 3 10.5Z M14 8c0-.7 1.6-1.3 3.5-1.3S21 7.3 21 8v2.5c0 .7-1.6 1.3-3.5 1.3S14 11.2 14 10.5Z",
  "🎹": "M10 13v4 M14 13v4 M18 13v4 M2 13h20 M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z M6 13v4",
  "🎛️": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z M6 8h4 M14 8h.01 M18 8h.01 M2 12h20 M6 12v4 M10 12v4 M14 12v4 M18 12v4",
  "📈": "M2 17L9 6v11l7-11v11l6-11",
  "🐋": "M10 2h4v4h-4Z M6.5 2.5H10 M6.5 4H10 M6.5 5.5H10 M11 6v8 M13 6v8 M8 14h8l1.5 4c.5 1.5-.5 3-2.5 3H9c-2 0-3-1.5-2.5-3Z M10 16.5h4 M10 18.800h4",
  "⭕": "M2 2 8 8 M22 2-8 8 M2 9a10 5 0 1 0 20 0 10 5 0 1 0 -20 0Z M7 13.4v7.9 M12 14v8 M17 13.4v7.9 M2 9v8a10 5 0 0 0 20 0V9",
  "🎺": "M3 9h10 M3 15h10 M3 9v6 M13 9l7-4v14l-7-4 M7 15v3 M10 15v3",
  "🎻": "M12 2v8 M9.5 6h5 M9 10a3 3 0 0 0-3 3c0 1 .6 1.7 1 2-1 1-2 2-2 3.5A3.5 3.5 0 0 0 8.5 22h7a3.5 3.5 0 0 0 3.5-3.5c0-1.5-1-2.5-2-3.5.4-.3 1-1 1-2a3 3 0 0 0-3-3Z",
  "🎼": "M3 8h18 M3 12h18 M3 16h18 M8 16V6l9-2v10 M6 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M15 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  "🪘": "M5 5h14l-2 15H7Z M5.5 9.5h13 M6.5 15h11",
  "👏": "M5 12l4-4 5 5-4 4a3 3 0 0 1-4.2 0L5 15a2 2 0 0 1 0-3Z M14 11l3-3a1.5 1.5 0 0 1 2 2l-4 4 M9 3v2 M5 4.5L6.5 6 M13 4l-1.5 1.5",
  "🔁": "M17 3l3 3-3 3 M20 6H8a4 4 0 0 0-4 4 M7 21l-3-3 3-3 M4 18h12a4 4 0 0 0 4-4",
  "🌊": "M2 8c3-3 5-3 8 0s5 3 8 0 M2 14c3-3 5-3 8 0s5 3 8 0 M2 20c3-3 5-3 8 0s5 3 8 0",
  "⚡": "M13 2L4 14h7l-1 8 9-12h-7Z",
  "✨": "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z",
  "🔊": "M4 9v6h4l5 4V5L8 9Z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11",
  "🎧": "M4 15v-3a8 8 0 0 1 16 0v3 M4 15h3v5H5a1 1 0 0 1-1-1Z M20 15h-3v5h2a1 1 0 0 0 1-1Z",
  "🎵": "M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  "🔔": "M6 17v-6a6 6 0 0 1 12 0v6l2 2H4Z M10 21a2 2 0 0 0 4 0",
};

/** The SVG path of a preset icon, or undefined for any other emoji. */
export function iconShape(icon: string): string | undefined {
  return Object.hasOwn(SHAPES, icon) ? SHAPES[icon] : undefined;
}
