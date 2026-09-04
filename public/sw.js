/* MagangHub Logbook — Service Worker untuk Web Push (Opsi B).
 * File ini ditaruh di client/public/sw.js agar Vite meng-copy-nya ke public/sw.js
 * saat build (outDir ../public). Scope root: registrasi via /sw.js.
 * Tangani push walau tab/browser ditutup (selama browser berjalan di background).
 */

self.addEventListener('push', (event) => {
  let data = { title: 'Draft logbook siap', body: 'Draft hari ini sudah jadi. Klik untuk cek dan lengkapi.', tag: 'draft-ready', url: '/?draft=ready' };
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
    icon: '/logo-absen.png',
    badge: '/logo-absen.png',
    data: { url: data.url || '/' },
    requireInteraction: false,
    // kalau tag kebetulan sama (misal reminder harian), tetap bunyi lagi, bukan replace diam-diam
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'MagangHub', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/?draft=ready';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          const url = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (url.origin === target.origin) {
            await client.focus();
            if ('navigate' in client && client.url !== target.href) {
              try { await client.navigate(target.href); } catch {}
            }
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
