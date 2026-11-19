// While Live loads a big set every request times out: one line each would bury the terminal under thousands.
const TIMED_OUT = /timed out/;
const SUMMARY_DELAY_MS = 2000;

let timeouts = 0;
let summaryTimer: NodeJS.Timeout | undefined;

/** Warns about a failed request to Live; timeouts are counted and summed up once Live answers again. */
export function warnLive(what: string, err: unknown, log: (message: string) => void = console.warn): void {
  const message = err instanceof Error ? err.message : String(err);
  if (!TIMED_OUT.test(message)) return log(`[live] ${what}: ${message}`);
  if (timeouts === 0) log("[live] Live is slow to answer (still loading the set?): timeouts are counted, not listed");
  timeouts += 1;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    log(`[live] ${timeouts} requests to Live timed out, the last one: ${what}`);
    timeouts = 0;
  }, SUMMARY_DELAY_MS);
  summaryTimer.unref();
}
