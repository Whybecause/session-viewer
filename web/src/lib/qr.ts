import qrcode from "qrcode-generator";

/** The dark modules of the text's QR code as one SVG path, one unit per module. */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const cells = Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), i % size] as const);
  const path = cells
    .filter(([row, col]) => qr.isDark(row, col))
    .map(([row, col]) => `M${col} ${row}h1v1h-1z`)
    .join("");
  return { size, path };
}
