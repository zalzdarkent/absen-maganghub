// Thin fetch wrapper mirroring the original vanilla-JS `api()` helper:
// JSON in/out, 120s timeout, and errors normalized to `Error(message)`.
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
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
        'Request timeout (>120 detik). Cek koneksi atau coba lagi — server mungkin masih memproses diff besar.'
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
