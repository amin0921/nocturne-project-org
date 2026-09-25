/**
 * Pre-decoded artwork pipeline (Patch 137).
 *
 * Chromium holds back the ENTIRE rendering pipeline — including active CSS
 * transforms on the album-art wrapper — while a new hi-res cover is decoded
 * into GPU memory (decoding="sync" behavior / Chromium bug 1455946), which is
 * the documented 1-2 frame drop on track swap. Decoding off-pipeline with a
 * detached probe image, and only assigning `img.src` after the bytes are
 * decode-ready, keeps the 300ms swap frame free of synchronous decode work.
 *
 * `artToken` is a monotonic race token: with rapid consecutive skips only the
 * NEWEST request may commit, so a slow stale decode can never overwrite the
 * current track's cover.
 */
let artToken = 0;

export async function decodeThenSwap(img: HTMLImageElement, src: string): Promise<boolean> {
  const token = ++artToken;
  const probe = new Image();
  probe.decoding = "async";
  probe.src = src;
  try {
    await probe.decode();
  } catch {
    // Fallback if decode fails or bytes are malformed — commit anyway so the
    // <img> fires its own onError and the caller can swap in the placeholder.
  }
  if (token !== artToken) return false;
  img.src = src;
  return true;
}

/**
 * Arm/release GPU compositing around a swap transition via transitionend:
 * `will-change: transform, opacity` is set just before the 300ms swap (so the
 * compositor owns the layer) and released immediately after it settles (so an
 * idle stage does not pin a full-size layer in GPU memory).
 */
export function armMotionLayer(el: HTMLElement | null): () => void {
  if (!el) return () => {};
  el.style.willChange = "transform, opacity";
  const release = (e: TransitionEvent) => {
    if (e.target !== el) return;
    if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
    el.style.willChange = "auto";
  };
  el.addEventListener("transitionend", release);
  // Safety net: if no transition runs (e.g. prefers-reduced-motion disables
  // transitions), never leave the layer pinned.
  const fallback = window.setTimeout(() => {
    el.style.willChange = "auto";
  }, 520);
  return () => {
    window.clearTimeout(fallback);
    el.style.willChange = "auto";
    el.removeEventListener("transitionend", release);
  };
}
