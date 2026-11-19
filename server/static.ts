import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".map": "application/json",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
};

// Vite fingerprints everything under /assets; index.html must be revalidated to pick up a new build.
// The fonts never change under their name: a week saves phones 80 KB on every launch.
const cacheControl = (pathname: string): string => {
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return pathname.startsWith("/fonts/") ? "public, max-age=604800" : "no-cache";
};

const ENTRY_SCRIPT = /<script[^>]*\ssrc="([^"]+)"/;

/** The fingerprinted entry script of the current build, read fresh: `npm run build` runs while the server is up. */
export async function entryScript(root: string): Promise<string | null> {
  try {
    return ENTRY_SCRIPT.exec(await readFile(join(root, "index.html"), "utf8"))?.[1] ?? null;
  } catch {
    return null;
  }
}

function requestPath(url: string | undefined): string | null {
  try {
    return decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
  } catch {
    return null;
  }
}

/** Resolves a request path inside `root`, or null when it would escape it. */
export function resolveInside(root: string, pathname: string): string | null {
  const filePath = normalize(join(root, pathname === "/" ? "index.html" : pathname));
  return filePath.startsWith(root + sep) ? filePath : null;
}

const RANGE = /^bytes=(\d*)-(\d*)$/;

/** The byte span a single-range `Range` header asks for, null when it is absent or unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = header === undefined ? null : RANGE.exec(header);
  if (!match || (match[1] === "" && match[2] === "")) return null;
  const isSuffix = match[1] === "";
  const start = isSuffix ? Math.max(size - Number(match[2]), 0) : Number(match[1]);
  const end = isSuffix || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start <= end && start < size ? { start, end } : null;
}

export function createStaticHandler(root: string) {
  const reply = (res: ServerResponse, status: number, headers: Record<string, string> = {}, body?: Buffer | string) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = requestPath(req.url);
    if (pathname === null) return reply(res, 400);
    const filePath = resolveInside(root, pathname);
    if (!filePath) return reply(res, 403);
    try {
      const body = await readFile(filePath);
      const contentType = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
      const headers = { "Content-Type": contentType, "Cache-Control": cacheControl(pathname), "Accept-Ranges": "bytes" };
      const rangeHeader = req.headers.range;
      const range = parseRange(rangeHeader, body.length);
      if (rangeHeader !== undefined && !range) return reply(res, 416, { ...headers, "Content-Range": `bytes */${body.length}` });
      if (!range) return reply(res, 200, headers, body);
      // Safari plays a <video> only from a server that answers its Range requests with 206.
      reply(res, 206, { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${body.length}` }, body.subarray(range.start, range.end + 1));
    } catch {
      reply(res, 404, { "Content-Type": "text/plain" }, "Not found — did you run `npm run build`?");
    }
  };
}
