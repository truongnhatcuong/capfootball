/// <reference lib="webworker" />
import { Serwist, NetworkOnly, StaleWhileRevalidate, CacheFirst, ExpirationPlugin, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
declare global { interface WorkerGlobalScope extends SerwistGlobalConfig { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined } }
declare const self: ServiceWorkerGlobalScope;
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, clientsClaim: true, navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.origin === self.location.origin && /^\/api\/(provinces|venues)$/.test(url.pathname), handler: new StaleWhileRevalidate({ cacheName: "public-catalog", plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86400 })] }) },
    { matcher: ({ url }) => url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    { matcher: ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")), handler: new CacheFirst({ cacheName: "static-assets", plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 604800 })] }) },
    // Authenticated pages and RSC responses always use the network. No private data is cached.
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
  ],
  fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] },
});
serwist.addEventListeners();
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") void self.skipWaiting(); });
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try { data = event.data?.json() ?? {}; } catch { /* Ignore malformed push content. */ }
  const url = data.url?.startsWith("/") && !data.url.startsWith("//") ? data.url : "/notifications";
  event.waitUntil(self.registration.showNotification(data.title || "CapFootBall", { body: data.body || "Bạn có cập nhật mới.", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/notifications")); });
