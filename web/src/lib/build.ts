/**
 * Whether this page runs an older build than the server now serves. A home screen app has no reload button and
 * survives a rebuild in memory, so it would keep the old code until killed.
 * `alreadyReloadedFor` stops a loop when a reload still brings the old page (a stale cache).
 */
export function isOutdated(own: string | null, served: string | null, alreadyReloadedFor: string | null): boolean {
  // Only a built page can tell: the Vite dev server serves /src/main.ts.
  if (!own?.startsWith("/assets/") || !served) return false;
  return own !== served && alreadyReloadedFor !== served;
}
