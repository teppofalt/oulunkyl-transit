/**
 * Service-worker registration for the installable Android PWA.
 *
 * Update strategy: the worker calls skipWaiting()/clients.claim(), and we ask
 * for an update check on each launch and whenever the app returns to the
 * foreground. A new build therefore takes effect on the next launch without any
 * user-facing update flow, and the currently visible screen is never replaced
 * underneath the user.
 */

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Dev builds are served by Vite; a worker would only cache stale modules.
  if (import.meta.env.DEV) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const check = () => void registration.update().catch(() => undefined);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    } catch {
      /* PWA caching is optional; the app works without it. */
    }
  };

  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}
