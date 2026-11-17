// Service worker for the part timer on the session page. Its only job is to
// show the "time is up" notification and open the session when it is tapped.
// It caches nothing and does not handle fetches, so the app has no offline mode.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url;
  // Only ever open a session page on this site.
  const target =
    typeof path === "string" && /^\/sessions\/[\w-]+$/.test(path)
      ? new URL(path, self.location.origin).href
      : new URL("/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.split("#")[0].split("?")[0] === target && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
