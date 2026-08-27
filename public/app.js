const state = {
  gitLogs: '',
  entries: [],
  manualMode: false,
};

// ---------- helpers ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function showToast(message, kind = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${kind}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function renderCommitLog(gitLogs) {
  const commitLog = $('#commitLog');
  const lines = String(gitLogs || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    commitLog.innerHTML = '<p class="muted">(tidak ada commit hari ini)</p>';
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

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

// ---------- tabs ----------
function switchTab(name) {
  $all('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $all('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
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
  }
}
$('#refreshCommits').addEventListener('click', loadStatus);

// ---------- generate ----------
function showDraftForm(manual = false) {
  state.manualMode = manual;
  $('#draftEmpty').classList.add('hidden');
  $('#draftForm').classList.remove('hidden');
  $('#regenerateBtn').classList.toggle('hidden', manual);
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
}

function resetDraftForm() {
  state.manualMode = false;
  $('#draftForm').reset();
  $('#draftForm').classList.add('hidden');
  $('#draftEmpty').classList.remove('hidden');
  $('#regenerateBtn').classList.remove('hidden');
  $('#cancelManualBtn').classList.add('hidden');
}

function openManualModal() {
  $('#manualDescription').value = '';
  $('#manualModalBackdrop').classList.remove('hidden');
  $('#manualDescription').focus();
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
  const description = $('#manualDescription').value.trim();
  if (!description) return;
  btn.disabled = true;
  btn.textContent = 'menyusun draft…';
  try {
    const data = await api('/api/generate-manual', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
    $('#fieldAktivitas').value = data.draft.aktivitas;
    $('#fieldPembelajaran').value = data.draft.pembelajaran;
    $('#fieldKendala').value = data.draft.kendala;
    showDraftForm(true);
    closeManualModal();
    showToast('Draft berhasil dibuat dari deskripsi kegiatan.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'beritahu AI';
  }
});

async function runGenerate() {
  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = 'meracik draft…';
  try {
    const data = await api('/api/generate', { method: 'POST' });
    state.gitLogs = data.gitLogs;
    $('#fieldAktivitas').value = data.draft.aktivitas;
    $('#fieldPembelajaran').value = data.draft.pembelajaran;
    $('#fieldKendala').value = data.draft.kendala;
    showDraftForm(false);
    showToast('Draft berhasil dibuat. Cek & edit sebelum simpan.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'generate dengan AI';
  }
}
$('#generateBtn').addEventListener('click', runGenerate);
$('#regenerateBtn').addEventListener('click', runGenerate);

$('#draftForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('#saveDraftBtn');
  saveBtn.disabled = true;
  try {
    await api('/api/entries', {
      method: 'POST',
      body: JSON.stringify({
        aktivitas: $('#fieldAktivitas').value.trim(),
        pembelajaran: $('#fieldPembelajaran').value.trim(),
        kendala: $('#fieldKendala').value.trim(),
        ...(state.manualMode ? {} : { gitLogs: state.gitLogs }),
      }),
    });
    showToast('Tersimpan ke Logbook_MagangHub.xlsx ✔');
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
        <div class="entry-preview">${truncate(entry.aktivitas, 140)}</div>
      `;
      el.addEventListener('click', () => openEditModal(entry));
      timeline.appendChild(el);
    });
  } catch (err) {
    timeline.innerHTML = `<p class="muted">${err.message}</p>`;
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
    showToast('Perubahan tersimpan ✔');
    closeEditModal();
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

$('#deleteEntryBtn').addEventListener('click', async () => {
  if (!editingRow) return;
  if (!confirm('Hapus entri ini dari Excel? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    await api(`/api/entries/${editingRow}`, { method: 'DELETE' });
    showToast('Entri dihapus.');
    closeEditModal();
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------- settings ----------
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    $('#settingApiKey').value = '';
    $('#settingApiKey').placeholder = data.hasApiKey ? data.apiKeyMasked : 'AIza…';
    $('#apiKeyHint').textContent = data.hasApiKey
      ? 'Sudah diatur. Isi ulang hanya jika ingin mengganti.'
      : 'Belum diatur — wajib diisi sebelum generate.';
    $('#settingRepoPath').value = data.repoPath || '';
    $('#settingModel').value = data.geminiModel || '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        apiKey: $('#settingApiKey').value.trim(),
        repoPath: $('#settingRepoPath').value.trim(),
        geminiModel: $('#settingModel').value.trim(),
      }),
    });
    showToast('Pengaturan tersimpan ✔');
    loadSettings();
    loadStatus();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------- init ----------
loadStatus();
