/**
 * Pure service-worker caching policy. Imported by public/sw.js (module worker)
 * and unit-tested directly.
 */

export const SHELL_URL = "/";

/** Live data and anything server-rendered on demand must never be cached. */
export function isLiveData(url) {
  return (
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.includes("_serverFn") ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_serverFnId")
  );
}

export function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.png" ||
    /\.(?:js|css|woff2?|png|svg|webp|ico)$/.test(url.pathname)
  );
}

/**
 * Only the root document may be stored as the offline shell — never /dev-hfp
 * or any other navigation response.
 */
export function shouldCacheAsShell(url, ok) {
  return ok === true && url.pathname === SHELL_URL;
}
