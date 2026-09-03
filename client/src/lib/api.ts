// Thin fetch wrapper: JSON in/out, timeout disesuaikan dengan backend (35s + buffer)
// Backend timeout 35s + vercel 60s, jadi client 45s agar pesan error backend sampai dulu (bukan generic abort)
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data && (data as { error?: string }).error) || 'Terjadi kesalahan.');
    }
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Request timeout (>45 detik). Server masih memproses / Gemini lambat. Coba lagi — percobaan kedua biasanya lebih cepat. Jika tetap, ganti model ke gemini-1.5-flash di Pengaturan.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadExcel(): Promise<void> {
  const res = await fetch('/api/entries/export');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data && (data as { error?: string }).error) || 'File Excel gagal dibuat.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Logbook_MagangHub.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
