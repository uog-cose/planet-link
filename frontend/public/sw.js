const CACHE = "yq-static-v19";
const STATIC = [
  "/",
  "/manifest.webmanifest",
  "/youth-quest-icon-192.png",
  "/youth-quest-icon-512.png",
  "/notification-badge.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("push", (event) => {
  let data = {
    title: "Youth Quest",
    body: "You have a new update.",
    url: "/",
    kind: "info",
    notificationId: null,
  };
  try {
    data = { ...data, ...(event.data?.json() || {}) };
  } catch {}
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = list.some((c) => c.visibilityState === "visible");
      // Always show the native notification. When the app is open we also send
      // the event into the page so the in-app celebration can appear immediately.
      // This is deliberately push-driven: no foreground polling is required.
      if (visible) {
        const target =
          list.find((c) => c.visibilityState === "visible") || list[0];
        if (target)
          target.postMessage({ type: "yq-notification", notification: data });
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: `yq-${data.notificationId || data.kind || Date.now()}`,
        data: { url: data.url || "/" },
        icon: "/youth-quest-icon-192.png",
        badge: "/notification-badge.png",
        renotify: true,
      });
    })(),
  );
});
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      // A browser may rotate a subscription. We cannot silently recreate the
      // server record without the authenticated app context, so notify an open
      // client to reconcile it immediately.
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      list.forEach((client) =>
        client.postMessage({ type: "yq-push-subscription-changed" }),
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sw.js"
  )
    return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.status === 200 && res.type !== "opaque")
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((r) => r || caches.match("/"))
            .then(
              (r) =>
                r ||
                new Response("Offline", {
                  status: 503,
                  headers: { "Content-Type": "text/plain" },
                }),
            ),
        ),
    );
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.status === 200 && res.type !== "opaque") {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(req, copy))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || new Response("", { status: 504 })),
      ),
  );
});
