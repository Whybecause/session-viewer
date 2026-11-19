/**
 * Keeps the screen on until the returned function is called. The browser drops the lock whenever the page goes
 * to the background, so it is asked for again each time the page comes back.
 */
export function holdWakeLock(): () => void {
  return "wakeLock" in navigator ? holdWithWakeLock() : holdWithVideo();
}

// ponytail: browsers expose Wake Lock only on https or localhost; a looping silent video is the NoSleep.js
// trick for http://192.168.x.x. Nothing guarantees browsers keep honoring it: if one stops, serve over https.
function holdWithVideo(): () => void {
  const video = document.createElement("video");
  video.src = "/keep-awake.mp4";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(video);

  const play = () => {
    if (document.visibilityState !== "visible") return;
    video.play().catch((err: Error) => {
      // Refused until the first touch: the expected case, not worth a warning.
      if (err.name !== "NotAllowedError") console.warn("[wake-lock] video:", err.message);
    });
  };
  const onVisibility = () => play();
  // Autoplay rules: the first touch is the gesture that lets the video start.
  document.addEventListener("pointerdown", play, { once: true });
  document.addEventListener("visibilitychange", onVisibility);
  play();
  return () => {
    document.removeEventListener("pointerdown", play);
    document.removeEventListener("visibilitychange", onVisibility);
    video.remove();
  };
}

function holdWithWakeLock(): () => void {
  let lock: WakeLockSentinel | null = null;
  let isStopped = false;
  let isRequesting = false;

  async function request() {
    if (isStopped || isRequesting || document.visibilityState !== "visible" || (lock && !lock.released)) return;
    isRequesting = true;
    try {
      lock = await navigator.wakeLock.request("screen");
      if (isStopped) await lock.release();
    } catch (err) {
      console.warn("[wake-lock] screen may go to sleep:", (err as Error).message);
    } finally {
      isRequesting = false;
    }
  }

  const onVisibility = () => void request();
  document.addEventListener("visibilitychange", onVisibility);
  void request();
  return () => {
    isStopped = true;
    document.removeEventListener("visibilitychange", onVisibility);
    void lock?.release();
  };
}
