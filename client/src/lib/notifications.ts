import type { ToastKind } from '../types';

const REMINDER_KEY_PREFIX = 'maganghub:daily-reminder:';
const REMINDER_HOUR = 15;
const REMINDER_MINUTE = 40;

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function canUseDesktopNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDesktopNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!canUseDesktopNotifications()) return 'unsupported';
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseDesktopNotifications()) return 'unsupported';
  return Notification.requestPermission();
}

export function notifyDesktop(title: string, options: NotificationOptions = {}) {
  if (!canUseDesktopNotifications() || Notification.permission !== 'granted') return false;

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function startDailyLogbookReminder(showToast: (message: string, kind?: ToastKind) => void) {
  if (typeof window === 'undefined') return () => undefined;

  const checkReminder = () => {
    const now = new Date();
    const alreadySentKey = `${REMINDER_KEY_PREFIX}${todayKey(now)}`;
    const isReminderTime =
      now.getHours() > REMINDER_HOUR || (now.getHours() === REMINDER_HOUR && now.getMinutes() >= REMINDER_MINUTE);

    if (!isReminderTime || localStorage.getItem(alreadySentKey)) return;

    localStorage.setItem(alreadySentKey, String(Date.now()));
    const message = 'Sudah jam 15.40, jangan lupa generate logbook hari ini ya.';
    const shownNative = notifyDesktop('Reminder logbook MagangHub', { body: message, tag: alreadySentKey });
    showToast(shownNative ? 'Reminder logbook dikirim ke desktop.' : message, 'info');
  };

  checkReminder();
  const interval = window.setInterval(checkReminder, 30_000);
  return () => window.clearInterval(interval);
}
