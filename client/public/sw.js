/* MagangHub Logbook — Service Worker untuk Web Push (Opsi B).
 * File ini ditaruh di client/public/sw.js agar Vite meng-copy-nya ke public/sw.js
 * saat build (outDir ../public). Scope root: registrasi via /sw.js.
 * Tangani push walau tab/browser ditutup (selama browser berjalan di background).
 */

self.addEventListener('push', (event) => {
  let data = { title: 'Reminder logbook MagangHub', body: 'Sudah jam 15.40, jangan lupa generate logbook hari ini ya.', tag: 'daily-reminder', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      // pakai default
    }
  }

  const options = {
    body: data.body,
    tag: data.tag || `maganghub-push-${Date.now()}`,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    requireInteraction: false,
    // kalau tag kebetulan sama (misal reminder harian), tetap bunyi lagi, bukan replace diam-diam
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'MagangHub', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          const url = new URL(client.url);
          if (url.pathname === targetUrl || targetUrl === '/') {
            await client.focus();
            return;
          }
        } catch {
          // abaikan URL yang tidak bisa diparse
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
