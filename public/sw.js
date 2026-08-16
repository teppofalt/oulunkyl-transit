/*
 * Oulunkylä Live — conservative service worker (ES module worker).
 *
 * Rules:
 *  - static app assets: cache-first with a versioned cache
 *  - navigations: network-first; only the root document "/" is stored as the
 *    offline shell (never /dev-hfp or any other page)
 *  - server functions / API traffic: NEVER cached (they carry live transport
 *    data and are produced by an authenticated server-side call; the key itself
 *    never reaches the client, and no request headers are stored here)
 */

import { SHELL_URL, isLiveData, isStaticAsset, shouldCacheAsShell } from "/sw-policy.js";

const VERSION = "v4";
const STATIC_CACHE = `oulunkyla-static-${VERSION}`;
const SHELL_CACHE = `oulunkyla-shell-${VERSION}`;

const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("oulunkyla-") && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isLiveData(url)) return; // straight to network, never stored

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (shouldCacheAsShell(url, response && response.ok)) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(SHELL_URL, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(SHELL_URL);
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset=utf-8><title>Ei verkkoyhteyttä</title><body style="font-family:system-ui;background:#101826;color:#f4f6fb;padding:24px"><h1>Ei verkkoyhteyttä.</h1><p>Ajantasaisia liikennetietoja ei voida hakea.</p></body>',
            { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
