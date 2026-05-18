/*
 * Kill switch. The previous service worker used stale-while-revalidate on
 * navigations, which served HTML referencing JS bundles whose hashes had
 * changed after a redeploy. iOS Safari users got cached pages pointing at
 * 404'd scripts, breaking every JS-driven control on the page.
 *
 * This file replaces the old worker: on activation it deletes every cache
 * the previous worker created, unregisters itself, and reloads open clients
 * so they pick up fresh HTML from the network on the next request.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});
