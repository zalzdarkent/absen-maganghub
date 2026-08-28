const state = {
  gitLogs: '',
  entries: [],
  manualMode: false,
  lastGenerateMode: 'commit', // 'commit' | 'manual' | 'combined'
};

// ---------- helpers ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Tailwind toaster — stacked, dismissible, auto-hide, supports success/error/warning/info
function showToast(message, kind = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    // Fallback if container missing
    console.log(`[${kind}] ${message}`);
    return;
  }
  const kindNorm = kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : kind === 'info' ? 'info' : 'success';
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const titles = { success: 'Berhasil', error: 'Gagal', warning: 'Perhatian', info: 'Info' };
  const colors = { success: '#3fb950', error: '#f85149', warning: '#d29922', info: '#58a6ff' };
  const duration = kindNorm === 'error' ? 5000 : kindNorm === 'warning' ? 4500 : 3500;

  const toast = document.createElement('div');
  toast.className = `toast-item ${kindNorm}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon ${kindNorm}">${icons[kindNorm]}</span>
    <div class="toast-message">
      <p class="toast-title">${titles[kindNorm]}</p>
      <p class="toast-desc">${escapeHtml(message)}</p>
    </div>
    <button class="toast-close" aria-label="tutup">×</button>
    <div class="toast-progress" style="animation-duration:${duration}ms; color:${colors[kindNorm]}"></div>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const progressEl = toast.querySelector('.toast-progress');
  let timer = null;
  let remaining = duration;
  let startTime = Date.now();

  function dismiss() {
    if (toast.classList.contains('out')) return;
    clearTimeout(timer);
    toast.classList.add('out');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 280);
  }
  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => {
    if (progressEl) progressEl.style.animationPlayState = 'paused';
    clearTimeout(timer);
    const elapsed = Date.now() - startTime;
    remaining = Math.max(0, remaining - elapsed);
  });
  toast.addEventListener('mouseleave', () => {
    if (progressEl) progressEl.style.animationPlayState = 'running';
    startTime = Date.now();
    timer = setTimeout(dismiss, remaining);
  });
  timer = setTimeout(dismiss, duration);
  container.appendChild(toast);
  while (container.children.length > 4) {
    container.firstElementChild.remove();
  }
}

function renderCommitLog(gitLogs) {
  const commitLog = $('#commitLog');
  const lines = String(gitLogs || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    commitLog.innerHTML = '<p class="muted">(tidak ada commit hari ini — mode gabungan tetap bisa pakai catatan manual saja)</p>';
    return;
  }
  commitLog.innerHTML = '';
  lines.forEach((line, index) => {
    const authorStart = line.lastIndexOf(' (');
    const message = line.startsWith('- ') ? line.slice(2, authorStart > 2 ? authorStart : undefined) : line;
    const author = authorStart > 2 && line.endsWith(')') ? line.slice(authorStart + 2, -1) : 'unknown';
    const item = document.createElement('article');
    item.className = 'commit-item';
    item.innerHTML = `
      <span class="commit-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="commit-content">
        <strong class="commit-message"></strong>
        <span class="commit-author"></span>
      </div>
    `;
    item.querySelector('.commit-message').textContent = message;
    item.querySelector('.commit-author').textContent = author;
    commitLog.appendChild(item);
  });
}

// API helper with timeout & better errors — perceives speed more honestly
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // client timeout 30s
  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timeout (>30 detik). Cek koneksi atau coba lagi — server mungkin masih memproses.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadExcel() {
  const res = await fetch('/api/entries/export');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'File Excel gagal dibuat.');
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

// ---------- tabs ----------
function switchTab(name) {
  $all('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  // Robust: support both .view class and legacy id^=view- selector (fixes routing bug where content stayed on root)
  const views = document.querySelectorAll('[id^="view-"]');
  views.forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  if (name === 'history') loadHistory();
  if (name === 'settings') loadSettings();
}
$all('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ---------- status + git log ----------
async function loadStatus() {
  const dot = $('#statusDot');
  const text = $('#statusText');
  try {
    const data = await api('/api/status');
    state.gitLogs = data.gitLogs;
    renderCommitLog(data.gitLogs);
    updateMergePreview();
    if (!data.hasCommitsToday) {
      dot.className = 'dot warn';
      text.textContent = 'belum ada commit hari ini';
    } else if (data.alreadyGenerated) {
      dot.className = 'dot ok';
      text.textContent = 'sudah di-generate hari ini';
    } else {
      dot.className = 'dot ok';
      text.textContent = 'siap di-generate';
    }
  } catch (err) {
    dot.className = 'dot err';
    text.textContent = 'repo bermasalah';
    const message = document.createElement('p');
    message.className = 'status-error';
    message.textContent = err.message;
    $('#commitLog').replaceChildren(message);
    showToast(err.message, 'error');
  }
}
$('#refreshCommits').addEventListener('click', loadStatus);

// ---------- generate helpers ----------
let generateTimer = null;
let generateStart = 0;

function setGenerateStatus(show, text) {
  const box = $('#generateStatus');
  const txt = $('#generateStatusText');
  if (!box) return;
  if (show) {
    txt.textContent = text || 'meracik draft…';
    box.classList.remove('hidden');
    generateStart = Date.now();
    $('#generateTimer').textContent = '0.0s';
    clearInterval(generateTimer);
    generateTimer = setInterval(() => {
      const sec = (Date.now() - generateStart) / 1000;
      $('#generateTimer').textContent = `${sec.toFixed(1)}s`;
      // hint after 8s
      if (sec > 8) txt.textContent = 'masih meracik… (Gemini kadang butuh 5-15 detik)';
      if (sec > 15) txt.textContent = 'sedikit lagi… coba tunggu';
    }, 200);
  } else {
    box.classList.add('hidden');
    clearInterval(generateTimer);
  }
}

function updateCharCounts() {
  const map = [
    ['#fieldAktivitas', '#countAktivitas'],
    ['#fieldPembelajaran', '#countPembelajaran'],
    ['#fieldKendala', '#countKendala'],
  ];
  map.forEach(([fieldSel, countSel]) => {
    const f = $(fieldSel);
    const c = $(countSel);
    if (!f || !c) return;
    const len = f.value.length;
    c.textContent = `${len} karakter` + (len < 100 ? ' — minimal 100' : len > 5000 ? ' — kepanjangan!' : ' ✔');
    c.style.color = len < 100 ? 'var(--amber)' : len > 5000 ? 'var(--red)' : 'var(--muted)';
  });
}

function showDraftForm(manual = false) {
  state.manualMode = manual;
  $('#draftEmpty').classList.add('hidden');
  $('#generateStatus').classList.add('hidden');
  $('#draftForm').classList.remove('hidden');
  $('#regenerateBtn').classList.toggle('hidden', false); // always show — will regen last mode
  $('#cancelManualBtn').classList.toggle('hidden', !manual);
  if (manual) {
    $('#fieldAktivitas').placeholder = 'Contoh: Mengikuti meeting kickoff sprint dan menyepakati pembagian task frontend.';
    $('#fieldPembelajaran').placeholder = 'Apa yang dipahami dari meeting atau aktivitas ini?';
    $('#fieldKendala').placeholder = 'Tulis kendala yang muncul, atau tulis "Tidak ada kendala".';
  } else {
    $('#fieldAktivitas').placeholder = '';
    $('#fieldPembelajaran').placeholder = '';
    $('#fieldKendala').placeholder = '';
  }
  updateCharCounts();
}

function resetDraftForm() {
  state.manualMode = false;
  state.lastGenerateMode = 'commit';
  const form = $('#draftForm');
  if (form) form.reset();
  $('#draftForm').classList.add('hidden');
  $('#draftEmpty').classList.remove('hidden');
  $('#regenerateBtn').classList.remove('hidden');
  $('#cancelManualBtn').classList.add('hidden');
  updateCharCounts();
}

// Merge modal preview (commit list inside modal)
function updateMergePreview() {
  const countEl = $('#mergeCommitCount');
  const previewEl = $('#mergeCommitPreview');
  const hintEl = $('#mergeHint');
  if (!countEl || !previewEl) return;
  const logs = String(state.gitLogs || '').trim();
  const lines = logs ? logs.split('\n').filter(Boolean) : [];
  if (lines.length === 0) {
    countEl.textContent = '(0 commit hari ini)';
    previewEl.innerHTML = '<span class="muted small">(tidak ada commit hari ini — nanti AI akan pakai catatan manual saja)</span>';
    if (hintEl) hintEl.textContent = 'Tidak ada commit hari ini, isi catatan minimal 5 karakter untuk generate dari catatan.';
  } else {
    countEl.textContent = `(${lines.length} commit)`;
    // show first 4 commits as preview, with +N more
    const toShow = lines.slice(0, 4);
    previewEl.innerHTML = toShow.map(l => `<div class="merge-commit-line">${escapeHtml(l)}</div>`).join('') + (lines.length > 4 ? `<div class="muted small">+${lines.length - 4} commit lainnya…</div>` : '');
    if (hintEl) hintEl.textContent = `Siap gabungkan ${lines.length} commit + catatan → hasil paling akurat ✨ (minimal 5 karakter)`;
  }
}

// Re-generate should repeat last mode
function setupCharCountListeners() {
  ['#fieldAktivitas', '#fieldPembelajaran', '#fieldKendala'].forEach(sel => {
    $(sel)?.addEventListener('input', updateCharCounts);
  });
}
setupCharCountListeners();

function openManualModal() {
  // now: merge modal (commit + catatan)
  updateMergePreview();
  const ta = $('#manualDescription');
  if (ta && !ta.value.trim()) {
    // keep previous value if user already typed, else clear
    // do not auto-clear if they had typed before
  }
  $('#manualModalBackdrop').classList.remove('hidden');
  setTimeout(() => $('#manualDescription')?.focus(), 50);
}
function closeManualModal() {
  $('#manualModalBackdrop').classList.add('hidden');
}
$('#manualBtn').addEventListener('click', openManualModal);
$('#closeManualModal').addEventListener('click', closeManualModal);
$('#cancelManualBtn').addEventListener('click', resetDraftForm);
$('#manualModalBackdrop').addEventListener('click', (e) => {
  if (e.target === $('#manualModalBackdrop')) closeManualModal();
});

$('#manualForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#tellAiBtn');
  const notes = $('#manualDescription').value.trim();
  const hasCommits = Boolean(String(state.gitLogs || '').trim());
  const hasNotes = notes.length >= 5;

  // Validasi: butuh minimal catatan jika tidak ada commit, atau minimal salah satu
  if (!hasNotes && !hasCommits) {
    showToast('Isi catatan minimal 5 karakter (tidak ada commit hari ini).', 'error');
    return;
  }
  if (!hasNotes && hasCommits) {
    // jika catatan kosong tapi ada commit, tanya konfirmasi — atau langsung pakai mode commit saja
    // kita fallback ke generate commit biasa agar tidak bingung
    closeManualModal();
    await runGenerate();
    return;
  }

  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'menggabungkan…';
  setGenerateStatus(true, hasCommits ? 'menggabungkan commit + catatan… ✨' : 'menyusun dari catatan…');
  try {
    // Selalu pakai endpoint gabungan — paling akurat. Jika commit kosong, backend tetap handle.
    const data = await api('/api/generate-combined', {
      method: 'POST',
      body: JSON.stringify({ manualNotes: notes, gitLogs: state.gitLogs || '' }),
    });
    state.lastGenerateMode = 'combined';
    state.manualMode = false;
    state._lastCombined = notes;
    state._lastManual = notes;
    if (data.gitLogs !== undefined) state.gitLogs = data.gitLogs;
    $('#fieldAktivitas').value = data.draft.aktivitas;
    $('#fieldPembelajaran').value = data.draft.pembelajaran;
    $('#fieldKendala').value = data.draft.kendala;
    showDraftForm(false);
    closeManualModal();
    const elapsed = ((Date.now() - generateStart)/1000).toFixed(1);
    showToast(`Draft gabungan jadi dalam ${elapsed}s — paling akurat ✨`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
    setGenerateStatus(false);
  }
});

async function runGenerate() {
  const btn = $('#generateBtn');
  btn.disabled = true;
  const label = btn.querySelector('.btn-label');
  const orig = label.textContent;
  label.textContent = 'meracik draft…';
  setGenerateStatus(true, 'meracik dari commit…');
  try {
    const data = await api('/api/generate', { method: 'POST' });
    state.gitLogs = data.gitLogs;
    state.lastGenerateMode = 'commit';
    $('#fieldAktivitas').value = data.draft.aktivitas;
    $('#fieldPembelajaran').value = data.draft.pembelajaran;
    $('#fieldKendala').value = data.draft.kendala;
    showDraftForm(false);
    const elapsed = ((Date.now() - generateStart)/1000).toFixed(1);
    showToast(`Draft dari commit jadi dalam ${elapsed}s ✔`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    label.textContent = orig;
    setGenerateStatus(false);
    updateMergePreview();
  }
}

// runGenerateCombined tetap dipanggil via regenerate atau bisa dipanggil langsung (fallback)
async function runGenerateCombined() {
  const notes = (state._lastCombined || $('#manualDescription')?.value || '').trim();
  if (!notes) {
    // fallback ke merge modal
    openManualModal();
    return;
  }
  setGenerateStatus(true, 'menggabungkan commit + catatan… ✨');
  try {
    const data = await api('/api/generate-combined', {
      method: 'POST',
      body: JSON.stringify({ manualNotes: notes, gitLogs: state.gitLogs }),
    });
    state.lastGenerateMode = 'combined';
    if (data.gitLogs !== undefined) state.gitLogs = data.gitLogs;
    $('#fieldAktivitas').value = data.draft.aktivitas;
    $('#fieldPembelajaran').value = data.draft.pembelajaran;
    $('#fieldKendala').value = data.draft.kendala;
    showDraftForm(false);
    const elapsed = ((Date.now() - generateStart)/1000).toFixed(1);
    showToast(`Draft gabungan jadi dalam ${elapsed}s — paling akurat ✨`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setGenerateStatus(false);
    updateMergePreview();
  }
}

$('#generateBtn').addEventListener('click', runGenerate);

// regenerate respects last mode
$('#regenerateBtn').addEventListener('click', async () => {
  if (state.lastGenerateMode === 'combined' && state._lastCombined) {
    await runGenerateCombined();
  } else if (state.lastGenerateMode === 'manual' && state._lastManual) {
    // re-trigger manual via API
    const btn = $('#regenerateBtn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'generate ulang…';
    setGenerateStatus(true, 'menyusun ulang dari catatan manual…');
    try {
      const data = await api('/api/generate-manual', { method: 'POST', body: JSON.stringify({ description: state._lastManual }) });
      $('#fieldAktivitas').value = data.draft.aktivitas;
      $('#fieldPembelajaran').value = data.draft.pembelajaran;
      $('#fieldKendala').value = data.draft.kendala;
      showToast('Draft diperbarui.', 'success');
      updateCharCounts();
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = orig; setGenerateStatus(false); }
  } else {
    await runGenerate();
  }
});

$('#draftForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('#saveDraftBtn');
  const aktivitas = $('#fieldAktivitas').value.trim();
  const pembelajaran = $('#fieldPembelajaran').value.trim();
  const kendala = $('#fieldKendala').value.trim();
  if (aktivitas.length < 100 || pembelajaran.length < 100 || kendala.length < 100) {
    showToast('Tiap field minimal 100 karakter (cek penghitung di bawah textarea).', 'error');
    return;
  }
  saveBtn.disabled = true;
  try {
    await api('/api/entries', {
      method: 'POST',
      body: JSON.stringify({
        aktivitas, pembelajaran, kendala,
        ...(state.manualMode ? {} : { gitLogs: state.gitLogs }),
      }),
    });
    await downloadExcel();
    showToast('Tersimpan dan Excel berhasil di-download ✔', 'success');
    resetDraftForm();
    loadStatus();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- history ----------
function truncate(text, n) {
  if (!text) return '';
  const s = String(text);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function loadHistory() {
  const timeline = $('#timeline');
  timeline.innerHTML = '<p class="muted">Memuat riwayat…</p>';
  try {
    const data = await api('/api/entries');
    state.entries = data.entries;
    $('#entryCount').textContent = `${data.entries.length} entri`;
    if (data.entries.length === 0) {
      timeline.innerHTML = '<p class="muted">Belum ada entri. Generate satu dari tab "generate".</p>';
      return;
    }
    timeline.innerHTML = '';
    data.entries.forEach((entry) => {
      const el = document.createElement('div');
      el.className = 'entry';
      el.innerHTML = `
        <div class="entry-head">
          <span class="entry-no">#${entry.no}</span>
          <span class="entry-date">${entry.tanggal}</span>
        </div>
        <div class="entry-preview">${escapeHtml(truncate(entry.aktivitas, 140))}</div>
      `;
      el.addEventListener('click', () => openEditModal(entry));
      timeline.appendChild(el);
    });
  } catch (err) {
    showToast(err.message, 'error');
    timeline.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

// ---------- edit modal ----------
let editingRow = null;

function openEditModal(entry) {
  editingRow = entry.rowNumber;
  $('#editModalDate').textContent = `#${entry.no} · ${entry.tanggal}`;
  $('#editAktivitas').value = entry.aktivitas || '';
  $('#editPembelajaran').value = entry.pembelajaran || '';
  $('#editKendala').value = entry.kendala || '';
  $('#editModalBackdrop').classList.remove('hidden');
}
function closeEditModal() {
  $('#editModalBackdrop').classList.add('hidden');
  editingRow = null;
}
$('#closeModal').addEventListener('click', closeEditModal);
$('#editModalBackdrop').addEventListener('click', (e) => {
  if (e.target === $('#editModalBackdrop')) closeEditModal();
});

$('#editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingRow) return;
  try {
    await api(`/api/entries/${editingRow}`, {
      method: 'PUT',
      body: JSON.stringify({
        aktivitas: $('#editAktivitas').value.trim(),
        pembelajaran: $('#editPembelajaran').value.trim(),
        kendala: $('#editKendala').value.trim(),
      }),
    });
    showToast('Perubahan tersimpan ✔', 'success');
    closeEditModal();
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

$('#deleteEntryBtn').addEventListener('click', async () => {
  if (!editingRow) return;
  if (!confirm('Hapus entri ini dari logbook? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    await api(`/api/entries/${editingRow}`, { method: 'DELETE' });
    showToast('Entri dihapus.', 'success');
    closeEditModal();
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------- settings (hanya repo github — disimpan di settings.json) ----------
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    const repoInput = document.getElementById('settingRepoPath');
    if (repoInput) {
      repoInput.value = data.repoPath || '';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const repoPath = document.getElementById('settingRepoPath')?.value.trim() ?? '';
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ repoPath }),
    });
    showToast('Repo GitHub tersimpan ✔', 'success');
    loadSettings();
    loadStatus();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------- init ----------
loadStatus();
