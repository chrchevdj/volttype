/**
 * VoltType — Renderer UI Logic
 * Handles page navigation, data display, and user interactions.
 */

// Use window.volttype directly to avoid re-declaring the global
// that contextBridge.exposeInMainWorld already created.
const vf = window.volttype;
const audio = window.audioCapture;

// State
let currentPage = 'home';
let settings = {};
let isRecording = false;
let recordingOpQueue = Promise.resolve(); // Serializes start/stop operations

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => vf.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => vf.maximize());
  document.getElementById('btn-close').addEventListener('click', () => vf.close());

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Load settings
  settings = await vf.getSettings();
  applySettings(settings);

  // Init audio with VAD
  const micOk = await audio.init();
  updateMicStatus(micOk);
  await refreshMicDevices();

  // Setup VAD callbacks (auto-stop only used in toggle mode, waveform always active)
  audio.setVADEnabled(false); // Off by default, enabled per-recording based on mode
  audio.setVADCallbacks(
    () => {
      console.log('[APP] VAD detected silence — auto-stopping (toggle mode)');
      if (isRecording) {
        vf.vadAutoStop();
      }
    },
    (level) => {
      updateAudioLevel(level);
    }
  );

  // Pre-warm mic: keep a stream ready so first recording starts instantly
  audio.preWarm();

  // Init pages
  await loadHistory();
  await loadDictionary();
  await loadSnippets();
  await loadVocabStats();
  updateQuickStart();

  // Setup all event handlers
  setupHomeHandlers();
  setupVocabHandlers();
  setupDictionaryHandlers();
  setupSnippetHandlers();
  setupScratchpadHandlers();
  setupSettingsHandlers();

  // Listen for IPC events from main
  vf.onRecordingState(handleRecordingState);
  vf.onTranscriptionResult(handleTranscriptionResult);
  vf.onTranscriptionError(handleTranscriptionError);
  vf.onNavigate(navigateTo);

  // Show app info in settings
  const appInfo = await vf.getAppInfo();
  document.getElementById('settings-path').textContent = appInfo.dataPath;
});

// ---- Navigation ----
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
}

// ---- Sound feedback ----
// Generate short tones using Web Audio API (no external files needed)
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine') {
  if (!settings.playSounds) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

// ---- Live audio level visualization ----
function updateAudioLevel(level) {
  const bars = document.getElementById('audio-bars');
  if (!bars) return;
  // Update each bar height based on audio level + random variation for organic feel
  const barEls = bars.children;
  for (let i = 0; i < barEls.length; i++) {
    const variation = Math.random() * 15;
    const height = Math.max(4, Math.min(32, (level + variation) * 0.4));
    barEls[i].style.height = height + 'px';
  }
}

function playStartSound() { playTone(880, 0.12); } // High short beep
function playStopSound() { playTone(440, 0.15); }  // Lower beep
function playSuccessSound() { playTone(660, 0.08); setTimeout(() => playTone(880, 0.12), 100); } // Rising double beep
function playErrorSound() { playTone(330, 0.25, 'square'); } // Low buzz

// ---- Recording flow ----
// Serialize all recording state changes to prevent race conditions.
// Without this, a rapid start→stop can call stopRecording() before
// startRecording()'s async getUserMedia has resolved, producing empty audio.
function handleRecordingState(data) {
  recordingOpQueue = recordingOpQueue.then(() => _handleRecordingState(data)).catch(err => {
    console.error('[APP] Recording operation failed:', err);
  });
}

async function _handleRecordingState({ recording, skip, mode }) {
  isRecording = recording;
  const banner = document.getElementById('recording-banner');
  const status = document.getElementById('sidebar-status');

  if (recording) {
    // -- START RECORDING --
    // Only enable VAD auto-stop in toggle mode (Ctrl+Shift+D)
    // In hold mode (Ctrl+Space), user controls stop by releasing keys
    audio.setVADEnabled(mode === 'toggle');

    banner.classList.remove('hidden');
    status.className = 'status-recording';
    status.querySelector('.status-text').textContent = mode === 'hold'
      ? 'Recording... (release keys to stop)'
      : 'Recording... (auto-stops when you pause)';
    try {
      await audio.startRecording();
      playStartSound();
      console.log(`[APP] Audio capture started (${mode} mode, VAD ${mode === 'toggle' ? 'ON' : 'OFF'})`);
    } catch (err) {
      console.error('[APP] Audio start failed:', err);
      playErrorSound();
      banner.classList.add('hidden');
      status.className = 'status-error';
      status.querySelector('.status-text').textContent = 'Mic Error';
      setTimeout(() => {
        status.className = 'status-idle';
        status.querySelector('.status-text').textContent = 'Ready';
      }, 3000);
    }
  } else {
    // -- STOP RECORDING --
    banner.classList.add('hidden');

    if (skip) {
      try { await audio.stopRecording(); } catch {}
      status.className = 'status-idle';
      status.querySelector('.status-text').textContent = 'Ready';
      return;
    }

    playStopSound();
    status.className = 'status-processing';
    status.querySelector('.status-text').textContent = 'Transcribing...';

    // Stop audio and send to main process
    try {
      const result = await audio.stopRecording();
      if (result && result.arrayBuffer.byteLength > 0) {
        const uint8 = new Uint8Array(result.arrayBuffer);
        // Fast base64 encoding using chunks to avoid stack overflow on large arrays
        const chunkSize = 8192;
        let binary = '';
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        console.log('[APP] Sending audio:', Math.round(uint8.length / 1024) + 'KB');
        const response = await vf.sendAudioCaptured({
          audioBase64: base64,
          mimeType: result.mimeType,
        });
        if (response && !response.success) {
          console.log('[APP] Transcription failed:', response.error);
        }
      } else {
        console.log('[APP] No audio captured (empty result)');
        status.className = 'status-idle';
        status.querySelector('.status-text').textContent = 'Ready';
      }
    } catch (err) {
      console.error('[APP] Audio stop/send failed:', err);
      status.className = 'status-error';
      status.querySelector('.status-text').textContent = 'Error';
      setTimeout(() => {
        status.className = 'status-idle';
        status.querySelector('.status-text').textContent = 'Ready';
      }, 3000);
    }
  }
}

function handleTranscriptionResult({ text, duration, apiLatency }) {
  const status = document.getElementById('sidebar-status');
  status.className = 'status-idle';
  status.querySelector('.status-text').textContent = 'Ready';
  playSuccessSound();

  // Refresh history and vocab
  loadHistory();
  loadVocabStats();

  // Update dictation count
  updateDictationCount();

  // If on scratchpad, append text
  if (currentPage === 'notebook') {
    const editor = document.getElementById('scratchpad-editor');
    editor.value += (editor.value ? ' ' : '') + text;
  }
}

function handleTranscriptionError({ message }) {
  const status = document.getElementById('sidebar-status');
  status.className = 'status-error';
  status.querySelector('.status-text').textContent = 'Error';
  playErrorSound();

  // Non-blocking error — just update status, no alert
  console.log('[APP] Transcription error:', message);

  setTimeout(() => {
    status.className = 'status-idle';
    status.querySelector('.status-text').textContent = 'Ready';
  }, 3000);
}

// ---- Home page ----
function setupHomeHandlers() {
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (confirm('Clear all dictation history?')) {
      await vf.clearHistory();
      await loadHistory();
    }
  });
}

async function loadHistory() {
  const entries = await vf.getHistory(20);
  const container = document.getElementById('history-list');

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No dictations yet. Press the hotkey to start!</div>';
    return;
  }

  container.innerHTML = entries.map(entry => `
    <div class="history-item" data-id="${entry.id}">
      <div class="history-text">${escapeHtml(entry.text)}</div>
      <div class="history-actions">
        <span class="history-meta">${formatTime(entry.timestamp)}${entry.editedAt ? ' (edited)' : ''}</span>
        <button class="history-edit" title="Edit &amp; teach">&#x270E;</button>
        <button class="history-delete" title="Delete">&times;</button>
      </div>
    </div>
  `).join('');

  // Edit button — inline editing that teaches the app
  container.querySelectorAll('.history-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item');
      const textEl = item.querySelector('.history-text');
      const currentText = textEl.textContent;

      // Replace text with editable textarea
      const textarea = document.createElement('textarea');
      textarea.className = 'history-edit-area';
      textarea.value = currentText;
      textarea.rows = 3;
      textEl.replaceWith(textarea);
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);

      // Replace edit button with save/cancel
      const actionsEl = item.querySelector('.history-actions');
      const origActions = actionsEl.innerHTML;
      actionsEl.innerHTML = `
        <button class="btn-primary btn-small history-save">Save &amp; Learn</button>
        <button class="btn-secondary btn-small history-cancel">Cancel</button>
      `;

      actionsEl.querySelector('.history-save').addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (newText && newText !== currentText) {
          await vf.editHistoryEntry({ id: item.dataset.id, newText });
          playSuccessSound();
        }
        await loadHistory();
        await loadVocabStats();
      });

      actionsEl.querySelector('.history-cancel').addEventListener('click', () => {
        loadHistory(); // Just reload to reset
      });
    });
  });

  container.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.history-item').dataset.id;
      await vf.deleteHistoryEntry(id);
      await loadHistory();
    });
  });
}

async function updateDictationCount() {
  const entries = await vf.getHistory();
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = entries.filter(e => e.timestamp.startsWith(today)).length;
  document.getElementById('display-dictations').textContent = todayCount;
}

function updateMicStatus(ok) {
  const el = document.getElementById('mic-status');
  const label = document.getElementById('display-mic');
  if (ok) {
    el.textContent = 'OK';
    el.className = 'card-status ok';
    label.textContent = 'Connected';
  } else {
    el.textContent = 'No Access';
    el.className = 'card-status error';
    label.textContent = 'Permission denied';
  }
}

function updateQuickStart() {
  // API key check
  const hasKey = settings.groqApiKey && settings.groqApiKey.length > 10;
  const stepKey = document.getElementById('step-apikey');
  if (hasKey) {
    stepKey.classList.add('done');
    stepKey.querySelector('.step-status').innerHTML = '&#x2713;';
  }

  // Engine status
  const engineStatus = document.getElementById('engine-status');
  const engineLabel = document.getElementById('display-engine');
  if (settings.engine === 'groq') {
    engineLabel.textContent = 'Groq Whisper';
    if (hasKey) {
      engineStatus.textContent = 'Ready';
      engineStatus.className = 'card-status ok';
    } else {
      engineStatus.textContent = 'No Key';
      engineStatus.className = 'card-status error';
    }
  } else {
    engineLabel.textContent = 'Local (whisper.cpp)';
    engineStatus.textContent = 'Beta';
    engineStatus.className = 'card-status warn';
  }

  // Hotkey display — primary is always Ctrl+Space (hold-to-talk), toggle is configurable
  document.getElementById('display-hotkey').textContent = 'Hold Ctrl+Space';
  document.getElementById('hotkey-display').textContent = settings.hotkey || 'Ctrl+Shift+D';

  // Quickstart section visibility
  const section = document.getElementById('quickstart-section');
  if (hasKey) {
    // Could hide quickstart after first use, but keep it for reference
  }
}

// ---- Vocabulary learning ----
function setupVocabHandlers() {
  document.getElementById('btn-add-term').addEventListener('click', async () => {
    const input = document.getElementById('vocab-term-input');
    const term = input.value.trim();
    if (!term) return;
    await vf.addVocabTerm(term);
    input.value = '';
    await loadVocabStats();
  });

  document.getElementById('vocab-term-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-add-term').click();
    }
  });
}

async function loadVocabStats() {
  const stats = await vf.getVocabStats();
  const terms = await vf.getVocabTerms();

  document.getElementById('display-vocab-size').textContent = stats.vocabSize;
  document.getElementById('display-terms-count').textContent = terms.length;
  document.getElementById('display-corrections-count').textContent = stats.correctionsCount || 0;

  const container = document.getElementById('vocab-terms-list');
  if (terms.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Terms auto-detected from your dictations will appear here. You can also add them manually.</span>';
    return;
  }

  container.innerHTML = terms.map(term => `
    <span class="vocab-tag">
      ${escapeHtml(term)}
      <button class="vocab-tag-remove" data-term="${escapeHtml(term)}" title="Remove">&times;</button>
    </span>
  `).join('');

  container.querySelectorAll('.vocab-tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const term = e.target.dataset.term;
      await vf.removeVocabTerm(term);
      await loadVocabStats();
    });
  });
}

// ---- Dictionary page ----
function setupDictionaryHandlers() {
  document.getElementById('btn-add-rule').addEventListener('click', () => {
    document.getElementById('rule-dialog').classList.remove('hidden');
    document.getElementById('rule-from').value = '';
    document.getElementById('rule-to').value = '';
    document.getElementById('rule-from').focus();
  });
  document.getElementById('btn-cancel-rule').addEventListener('click', () => {
    document.getElementById('rule-dialog').classList.add('hidden');
  });
  document.getElementById('btn-save-rule').addEventListener('click', async () => {
    const from = document.getElementById('rule-from').value.trim();
    const to = document.getElementById('rule-to').value;
    const type = document.getElementById('rule-type').value;
    if (!from) return;
    await vf.addDictionaryRule({ from, to, type });
    document.getElementById('rule-dialog').classList.add('hidden');
    await loadDictionary();
  });
}

async function loadDictionary() {
  const rules = await vf.getDictionary();
  const container = document.getElementById('dictionary-list');

  if (rules.length === 0) {
    container.innerHTML = '<div class="empty-state">No replacement rules. Add one above!</div>';
    return;
  }

  container.innerHTML = rules.map((rule, i) => `
    <div class="rule-item" data-index="${i}">
      <input type="checkbox" class="rule-toggle" ${rule.enabled ? 'checked' : ''}>
      <span class="rule-from">${escapeHtml(rule.from)}</span>
      <span class="rule-arrow">&rarr;</span>
      <span class="rule-to">${escapeHtml(rule.to).replace(/\n/g, '\\n')}</span>
      <span class="rule-type">${rule.type}</span>
      <button class="rule-delete" title="Delete">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('.rule-toggle').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const idx = parseInt(e.target.closest('.rule-item').dataset.index);
      await vf.updateDictionaryRule({ index: idx, updates: { enabled: e.target.checked } });
    });
  });

  container.querySelectorAll('.rule-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.closest('.rule-item').dataset.index);
      await vf.removeDictionaryRule(idx);
      await loadDictionary();
    });
  });
}

// ---- Snippets page ----
function setupSnippetHandlers() {
  document.getElementById('btn-add-snippet').addEventListener('click', () => {
    document.getElementById('snippet-dialog').classList.remove('hidden');
    document.getElementById('snippet-name').value = '';
    document.getElementById('snippet-text').value = '';
    document.getElementById('snippet-name').focus();
  });
  document.getElementById('btn-cancel-snippet').addEventListener('click', () => {
    document.getElementById('snippet-dialog').classList.add('hidden');
  });
  document.getElementById('btn-save-snippet').addEventListener('click', async () => {
    const name = document.getElementById('snippet-name').value.trim();
    const text = document.getElementById('snippet-text').value;
    if (!name || !text) return;
    await vf.addSnippet({ name, text, category: 'general' });
    document.getElementById('snippet-dialog').classList.add('hidden');
    await loadSnippets();
  });
}

async function loadSnippets() {
  const items = await vf.getSnippets();
  const container = document.getElementById('snippets-list');

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No snippets saved. Create reusable text blocks above!</div>';
    return;
  }

  container.innerHTML = items.map(s => `
    <div class="snippet-card" data-id="${s.id}">
      <div class="snippet-name">${escapeHtml(s.name)}</div>
      <div class="snippet-preview">${escapeHtml(s.text)}</div>
      <div class="snippet-actions">
        <button class="btn-secondary btn-small snippet-inject">Insert</button>
        <button class="btn-text btn-small btn-danger snippet-delete">Delete</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.snippet-inject').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.snippet-card').dataset.id;
      await vf.injectSnippet(id);
    });
  });

  container.querySelectorAll('.snippet-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.snippet-card').dataset.id;
      await vf.removeSnippet(id);
      await loadSnippets();
    });
  });
}

// ---- Scratchpad page ----
function setupScratchpadHandlers() {
  document.getElementById('btn-scratchpad-clear').addEventListener('click', () => {
    document.getElementById('scratchpad-editor').value = '';
  });
  document.getElementById('btn-scratchpad-copy').addEventListener('click', () => {
    const text = document.getElementById('scratchpad-editor').value;
    navigator.clipboard.writeText(text);
  });
}

// ---- Settings page ----
function setupSettingsHandlers() {
  // API key toggle visibility
  document.getElementById('btn-toggle-key').addEventListener('click', (e) => {
    const input = document.getElementById('setting-groq-key');
    if (input.type === 'password') {
      input.type = 'text';
      e.target.textContent = 'Hide';
    } else {
      input.type = 'password';
      e.target.textContent = 'Show';
    }
  });

  // Save on change for each setting
  const saveSetting = (id, key, transform) => {
    const el = document.getElementById(id);
    if (!el) return;
    const event = el.type === 'checkbox' ? 'change' : 'change';
    el.addEventListener(event, async () => {
      const value = el.type === 'checkbox' ? el.checked : (transform ? transform(el.value) : el.value);
      await vf.updateSettings({ [key]: value });
      settings[key] = value;
      updateQuickStart();
    });
  };

  // Groq key saves on blur (not change) for text input
  document.getElementById('setting-groq-key').addEventListener('blur', async () => {
    const value = document.getElementById('setting-groq-key').value.trim();
    await vf.updateSettings({ groqApiKey: value });
    settings.groqApiKey = value;
    updateQuickStart();
  });

  saveSetting('setting-engine', 'engine');
  saveSetting('setting-language', 'language');
  saveSetting('setting-hotkey', 'hotkey');
  saveSetting('setting-output-style', 'outputStyle');
  saveSetting('setting-injection', 'injectionMode');
  saveSetting('setting-start-minimized', 'startMinimized');
  saveSetting('setting-start-windows', 'startWithWindows');
  saveSetting('setting-sounds', 'playSounds');
  saveSetting('setting-microphone', 'microphone');

  // Refresh microphone list
  document.getElementById('btn-refresh-mics').addEventListener('click', refreshMicDevices);
}

function applySettings(s) {
  setVal('setting-engine', s.engine);
  setVal('setting-groq-key', s.groqApiKey);
  setVal('setting-language', s.language);
  setVal('setting-hotkey', s.hotkey);
  setVal('setting-output-style', s.outputStyle || 'cleaned');
  setVal('setting-injection', s.injectionMode);
  setChecked('setting-start-minimized', s.startMinimized);
  setChecked('setting-start-windows', s.startWithWindows);
  setChecked('setting-sounds', s.playSounds);
}

async function refreshMicDevices() {
  const devices = await audio.getDevices();
  const select = document.getElementById('setting-microphone');
  select.innerHTML = '<option value="default">Default</option>';
  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.label;
    if (d.id === settings.microphone) opt.selected = true;
    select.appendChild(opt);
  });

  // Update mic status on home
  const stepMic = document.getElementById('step-mic');
  if (devices.length > 0) {
    stepMic.classList.add('done');
    stepMic.querySelector('.step-status').innerHTML = '&#x2713;';
    updateMicStatus(true);
  }
}

// ---- Helpers ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined) el.value = value;
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}
