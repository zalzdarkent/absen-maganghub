// Helper Web Push client (Opsi B). Dipakai SettingsView + App.
// Alur: register /sw.js -> ambil VAPID public key dari backend -> pushManager.subscribe -> POST /api/push/subscribe
import { api } from './api';

export interface PushStatus {
  configured: boolean;
  subscriptionCount: number;
  lastSentDay?: string;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function canUsePush() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    (window.isSecureContext || window.location.hostname === 'localhost')
  );
}

export async function getSWRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration('/')) || null;
  } catch {
    return null;
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Browser tidak mendukung service worker.');
  const existing = await getSWRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getExistingPushSubscription() {
  const reg = (await getSWRegistration()) || (await registerServiceWorker().catch(() => null));
  if (!reg || !reg.pushManager) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribePush() {
  if (!canUsePush()) throw new Error('Push tidak didukung (butuh HTTPS/localhost + Chrome/Edge/Firefox).');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan.');
  const reg = await registerServiceWorker();
  const { publicKey } = await api<{ publicKey: string }>('/api/push/vapid-public-key');
  if (!publicKey) throw new Error('VAPID public key kosong di server.');
  const existing = await reg.pushManager.getSubscription().catch(() => null);
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
    }));
  const json = subscription.toJSON();
  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: json }) });
  return subscription;
}

export async function unsubscribePush() {
  const sub = await getExistingPushSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch {
      // lanjut hapus di server walau unsubscribe lokal gagal
    }
    try {
      await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
    } catch {
      // abaikan error server, subscription lokal sudah dihapus
    }
    return true;
  }
  return false;
}

export async function fetchPushStatus() {
  return api<PushStatus>('/api/push/status');
}

export async function sendTestPush() {
  return api<{ ok: boolean; sent: number; failed: number; total: number }>('/api/push/send', {
    method: 'POST',
    // tag unik per klik: kalau tag sama, Chrome/Windows cuma me-replace notif lama
    // secara diam-diam (tidak popup lagi) sehingga kelihatan "cuma bunyi sekali".
    body: JSON.stringify({ title: 'Test push MagangHub', body: 'Notifikasi push aktif ✔ (walau tab ditutup tetap masuk)', tag: `push-test-${Date.now()}` }),
  });
}
