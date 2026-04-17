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

  // Check auth — show login screen or main app
  await initAuth();

  // Load settings
  settings = await vf.getSettings();
  applySettings(settings);

  // Check local STT status for engine display
  try {
    const localStatus = await vf.getLocalSttStatus();
    window._localSttReady = localStatus.ready;
  } catch { window._localSttReady = false; }

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
  await loadUsageStats();
  updateQuickStart();
  initOnboarding();

  // Setup all event handlers
  setupHomeHandlers();
  setupUpgradeHandlers();
  setupVocabHandlers();
  setupDictionaryHandlers();
  setupSnippetHandlers();
  setupScratchpadHandlers();
  setupNotesHandlers();
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

// ---- Live audio level visualization (canvas waveform) ----
const waveformState = {
  history: new Float32Array(128).fill(0), // rolling level history
  historyIdx: 0,
  smoothLevel: 0,
  animFrame: null,
  startTime: 0,
  timerInterval: null,
};

function updateAudioLevel(level) {
  // Store in rolling history buffer
  waveformState.history[waveformState.historyIdx % waveformState.history.length] = level;
  waveformState.historyIdx++;
  // Smooth the current level for glow effects
  waveformState.smoothLevel += (level - waveformState.smoothLevel) * 0.3;
}

function startWaveformAnimation() {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Start timer
  waveformState.startTime = Date.now();
  waveformState.timerInterval = setInterval(updateRecordingTimer, 1000);
  updateRecordingTimer();

  // Reset history
  waveformState.history.fill(0);
  waveformState.historyIdx = 0;
  waveformState.smoothLevel = 0;

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const hist = waveformState.history;
    const len = hist.length;
    const idx = waveformState.historyIdx;
    const now = performance.now() / 1000;
    const smoothLevel = waveformState.smoothLevel;
    const normalizedLevel = Math.min(smoothLevel / 80, 1); // Normalize 0-80 range

    // -- Draw mirrored waveform with gradient fill --
    const midY = H / 2;
    const maxAmp = H * 0.42;

    // Create gradient for the wave fill
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, `rgba(56,189,156,${0.02 + normalizedLevel * 0.08})`);
    grad.addColorStop(0.3, `rgba(56,189,156,${0.08 + normalizedLevel * 0.2})`);
    grad.addColorStop(0.6, `rgba(59,130,246,${0.06 + normalizedLevel * 0.15})`);
    grad.addColorStop(1, `rgba(139,92,246,${0.03 + normalizedLevel * 0.1})`);

    // Stroke gradient
    const strokeGrad = ctx.createLinearGradient(0, 0, W, 0);
    strokeGrad.addColorStop(0, `rgba(56,189,156,${0.3 + normalizedLevel * 0.5})`);
    strokeGrad.addColorStop(0.5, `rgba(59,130,246,${0.3 + normalizedLevel * 0.4})`);
    strokeGrad.addColorStop(1, `rgba(139,92,246,${0.2 + normalizedLevel * 0.3})`);

    // Build upper wave path from history
    const points = [];
    for (let i = 0; i < len; i++) {
      const dataIdx = (idx - len + i + len * 2) % len;
      const rawVal = hist[dataIdx] / 80; // normalize
      // Add a subtle sine wave even at zero for visual interest
      const ambient = Math.sin(now * 2 + i * 0.15) * 0.03 + Math.sin(now * 3.7 + i * 0.08) * 0.02;
      const val = Math.min(rawVal + ambient, 1);
      const x = (i / (len - 1)) * W;
      const amp = val * maxAmp;
      points.push({ x, amp });
    }

    // Draw filled wave (upper half)
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) {
        ctx.lineTo(p.x, midY - p.amp);
      } else {
        // Smooth curve between points
        const prev = points[i - 1];
        const cpx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, midY - prev.amp, cpx, midY - (prev.amp + p.amp) / 2);
        if (i === points.length - 1) {
          ctx.quadraticCurveTo(p.x, midY - p.amp, p.x, midY - p.amp);
        }
      }
    }
    // Close by mirroring down
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (i === points.length - 1) {
        ctx.lineTo(p.x, midY + p.amp);
      } else {
        const next = points[i + 1];
        const cpx = (next.x + p.x) / 2;
        ctx.quadraticCurveTo(next.x, midY + next.amp, cpx, midY + (next.amp + p.amp) / 2);
        if (i === 0) {
          ctx.quadraticCurveTo(p.x, midY + p.amp, p.x, midY + p.amp);
        }
      }
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw upper stroke line
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) {
        ctx.lineTo(p.x, midY - p.amp);
      } else {
        const prev = points[i - 1];
        const cpx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, midY - prev.amp, cpx, midY - (prev.amp + p.amp) / 2);
        if (i === points.length - 1) {
          ctx.quadraticCurveTo(p.x, midY - p.amp, p.x, midY - p.amp);
        }
      }
    }
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw lower stroke line (mirror)
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) {
        ctx.lineTo(p.x, midY + p.amp);
      } else {
        const prev = points[i - 1];
        const cpx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, midY + prev.amp, cpx, midY + (prev.amp + p.amp) / 2);
        if (i === points.length - 1) {
          ctx.quadraticCurveTo(p.x, midY + p.amp, p.x, midY + p.amp);
        }
      }
    }
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center glow line
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(W, midY);
    ctx.strokeStyle = `rgba(56,189,156,${0.08 + normalizedLevel * 0.12})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Glow effect at peak areas
    if (normalizedLevel > 0.15) {
      const glowGrad = ctx.createRadialGradient(W * 0.7, midY, 0, W * 0.7, midY, W * 0.35);
      glowGrad.addColorStop(0, `rgba(56,189,156,${normalizedLevel * 0.12})`);
      glowGrad.addColorStop(1, 'rgba(56,189,156,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, W, H);
    }

    waveformState.animFrame = requestAnimationFrame(draw);
  }

  draw();
}

function stopWaveformAnimation() {
  if (waveformState.animFrame) {
    cancelAnimationFrame(waveformState.animFrame);
    waveformState.animFrame = null;
  }
  if (waveformState.timerInterval) {
    clearInterval(waveformState.timerInterval);
    waveformState.timerInterval = null;
  }
}

function updateRecordingTimer() {
  const el = document.getElementById('recording-timer');
  if (!el) return;
  const elapsed = Math.floor((Date.now() - waveformState.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
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
    startWaveformAnimation();
    status.className = 'status-recording';
    status.querySelector('.status-text').textContent = mode === 'hold'
      ? 'Recording... (release keys to stop)'
      : 'Recording... (auto-stops when you pause)';
    // Update sublabel based on mode
    const sublabel = banner.querySelector('.recording-sublabel');
    if (sublabel) {
      sublabel.textContent = mode === 'hold' ? 'Release keys to stop' : 'Auto-stops when you pause';
    }
    try {
      await audio.startRecording();
      playStartSound();
      console.log(`[APP] Audio capture started (${mode} mode, VAD ${mode === 'toggle' ? 'ON' : 'OFF'})`);
    } catch (err) {
      console.error('[APP] Audio start failed:', err);
      playErrorSound();
      stopWaveformAnimation();
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
    stopWaveformAnimation();
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

function handleTranscriptionResult({ text, duration: _duration, apiLatency: _apiLatency, voiceCommand, voiceCommandLabel }) {
  const status = document.getElementById('sidebar-status');

  if (voiceCommand) {
    // Voice command was executed — show special feedback
    status.className = 'status-idle';
    status.querySelector('.status-text').textContent = voiceCommandLabel || 'Command done';
    playSuccessSound();
    // Show a brief command notification
    setTimeout(() => {
      status.querySelector('.status-text').textContent = 'Ready';
    }, 2500);
  } else {
    status.className = 'status-idle';
    status.querySelector('.status-text').textContent = 'Ready';
    playSuccessSound();
  }

  // Refresh history and vocab
  loadHistory();
  loadVocabStats();

  // Update dictation count
  updateDictationCount();

  // If on notebook, append text to notes editor
  if (currentPage === 'notebook') {
    const editor = document.getElementById('notes-editor');
    const charCount = document.getElementById('notes-char-count');
    if (voiceCommand) {
      // Voice command rewrites the last text — replace last portion
      editor.value = text;
    } else {
      editor.value += (editor.value ? ' ' : '') + text;
    }
    if (charCount) charCount.textContent = editor.value.length + ' chars';
  }

  // Show correction popup for non-command transcriptions
  if (!voiceCommand && text && text.trim().length > 0) {
    showCorrectionPopup(text);
  }
}

// ---- Correction Popup ----
let correctionTimer = null;
let correctionCountdown = null;
let correctionOriginalText = '';

function showCorrectionPopup(text) {
  const popup = document.getElementById('correction-popup');
  const textarea = document.getElementById('correction-text');
  const timerEl = document.getElementById('correction-timer');

  // Clear any existing timer
  dismissCorrectionPopup(true);

  correctionOriginalText = text;
  textarea.value = text;
  textarea.rows = Math.min(5, Math.max(2, text.split('\n').length));
  popup.classList.remove('hidden', 'edited', 'saving');
  timerEl.textContent = '8s';

  let secondsLeft = 8;
  correctionCountdown = setInterval(() => {
    secondsLeft--;
    timerEl.textContent = secondsLeft + 's';
    if (secondsLeft <= 0) {
      dismissCorrectionPopup();
    }
  }, 1000);

  // Pause auto-close when user starts editing
  textarea.oninput = () => {
    const changed = textarea.value.trim() !== correctionOriginalText.trim();
    popup.classList.toggle('edited', changed);
    if (changed && correctionCountdown) {
      clearInterval(correctionCountdown);
      correctionCountdown = null;
      timerEl.textContent = '';
    }
  };
}

function dismissCorrectionPopup(silent) {
  const popup = document.getElementById('correction-popup');
  if (correctionCountdown) {
    clearInterval(correctionCountdown);
    correctionCountdown = null;
  }
  if (correctionTimer) {
    clearTimeout(correctionTimer);
    correctionTimer = null;
  }
  if (!silent) {
    popup.classList.add('hidden');
  }
  correctionOriginalText = '';
}

async function saveCorrection() {
  const popup = document.getElementById('correction-popup');
  const textarea = document.getElementById('correction-text');
  const newText = textarea.value.trim();

  if (!newText || newText === correctionOriginalText.trim()) {
    dismissCorrectionPopup();
    return;
  }

  popup.classList.add('saving');

  try {
    await vf.correctAndReinject({ originalText: correctionOriginalText, newText });
    playSuccessSound();
    loadVocabStats();
    loadHistory();
  } catch (err) {
    console.error('[CORRECTION] Error:', err);
  }

  dismissCorrectionPopup();
}

// Wire up correction popup buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('correction-dismiss').addEventListener('click', () => dismissCorrectionPopup());
  document.getElementById('correction-save').addEventListener('click', () => saveCorrection());

  // Escape key dismisses popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const popup = document.getElementById('correction-popup');
      if (!popup.classList.contains('hidden')) {
        dismissCorrectionPopup();
      }
    }
  });
});

function showUpgradeBanner() {
  document.getElementById('upgrade-banner').classList.remove('hidden');
}

function hideUpgradeBanner() { // eslint-disable-line no-unused-vars
  document.getElementById('upgrade-banner').classList.add('hidden');
}

function handleTranscriptionError({ message }) {
  const status = document.getElementById('sidebar-status');
  status.className = 'status-error';
  status.querySelector('.status-text').textContent = 'Error';
  playErrorSound();

  // Check if this is a limit error — show upgrade banner
  if (message && (message.includes('limit') || message.includes('Daily limit'))) {
    showUpgradeBanner();
  }

  console.log('[APP] Transcription error:', message);

  setTimeout(() => {
    status.className = 'status-idle';
    status.querySelector('.status-text').textContent = 'Ready';
  }, 3000);
}

// ---- Home page ----
function setupHomeHandlers() {
  const installBtn = document.getElementById('btn-install-update');
  if (installBtn) {
    installBtn.addEventListener('click', () => vf.installUpdate());
  }

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (confirm('Clear all dictation history?')) {
      await vf.clearHistory();
      await loadHistory();
      await loadUsageStats();
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
      const _origActions = actionsEl.innerHTML;
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
  if (settings.engine === 'local') {
    engineLabel.textContent = 'Local (Offline)';
    // Check if local model is ready via cached status
    if (window._localSttReady) {
      engineStatus.textContent = 'Ready';
      engineStatus.className = 'card-status ok';
    } else {
      engineStatus.textContent = 'No Model';
      engineStatus.className = 'card-status warn';
    }
  } else {
    engineLabel.textContent = 'Groq Whisper';
    if (hasKey) {
      engineStatus.textContent = 'Ready';
      engineStatus.className = 'card-status ok';
    } else {
      engineStatus.textContent = 'No Key';
      engineStatus.className = 'card-status error';
    }
  }

  // Hotkey display — primary is always Ctrl+Space (hold-to-talk), toggle is configurable
  document.getElementById('display-hotkey').textContent = 'Hold Ctrl+Space';
  document.getElementById('hotkey-display').textContent = settings.hotkey || 'Ctrl+Shift+D';

  // Quickstart section visibility
  const _section = document.getElementById('quickstart-section');
  if (hasKey) {
    // Could hide quickstart after first use, but keep it for reference
  }
}

// ---- Vocabulary learning ----
function setupUpgradeHandlers() {
  document.getElementById('btn-upgrade-basic').addEventListener('click', async () => {
    const result = await vf.checkout('basic');
    if (!result.success) {
      console.log('[APP] Checkout error:', result.error);
    }
  });
  document.getElementById('btn-upgrade-pro').addEventListener('click', async () => {
    const result = await vf.checkout('pro');
    if (!result.success) {
      console.log('[APP] Checkout error:', result.error);
    }
  });
}

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

// ---- Scratchpad page (legacy, kept for compat) ----
function setupScratchpadHandlers() {}

// ---- AI Notes Workspace ----
function setupNotesHandlers() {
  const editor = document.getElementById('notes-editor');
  const charCount = document.getElementById('notes-char-count');
  const outputArea = document.getElementById('notes-output-area');
  const outputContent = document.getElementById('notes-output-content');
  const outputLabel = document.getElementById('notes-output-label');
  const processing = document.getElementById('notes-processing');

  // Character count
  editor.addEventListener('input', () => {
    charCount.textContent = editor.value.length + ' chars';
  });

  // Clear
  document.getElementById('btn-notes-clear').addEventListener('click', () => {
    editor.value = '';
    charCount.textContent = '0 chars';
    outputArea.classList.add('hidden');
  });

  // Copy input
  document.getElementById('btn-notes-copy-input').addEventListener('click', () => {
    navigator.clipboard.writeText(editor.value);
  });

  // Copy output
  document.getElementById('btn-notes-copy-output').addEventListener('click', () => {
    navigator.clipboard.writeText(outputContent.textContent);
  });

  // Paste to app (inject via snippet)
  document.getElementById('btn-notes-inject').addEventListener('click', async () => {
    const text = outputContent.textContent;
    if (text) {
      await vf.addSnippet({ name: '_temp_inject', text, category: 'temp' });
      const snippets = await vf.getSnippets();
      const temp = snippets.find(s => s.name === '_temp_inject');
      if (temp) {
        await vf.injectSnippet(temp.id);
        await vf.removeSnippet(temp.id);
      }
    }
  });

  // Save as template
  document.getElementById('btn-notes-save-template').addEventListener('click', async () => {
    const text = outputContent.textContent;
    if (!text) return;
    const name = prompt('Template name:');
    if (!name) return;
    await vf.addSnippet({ name, text, category: 'ai-notes' });
    alert('Saved as template!');
  });

  // AI action buttons
  const actionLabels = {
    summarize_notes: 'Summary',
    action_items: 'Action Items',
    follow_ups: 'Follow-ups',
    meeting_notes: 'Meeting Notes',
    email_draft: 'Email Draft',
  };

  document.querySelectorAll('.notes-ai-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = editor.value.trim();
      if (!text) return;

      const action = btn.dataset.action;

      // Show processing
      processing.classList.remove('hidden');
      outputArea.classList.add('hidden');
      document.querySelectorAll('.notes-ai-btn').forEach(b => b.disabled = true);

      try {
        const result = await vf.aiTransform({ text, action });
        if (result.text) {
          outputLabel.textContent = actionLabels[action] || 'Result';
          outputContent.textContent = result.text;
          outputArea.classList.remove('hidden');
        } else if (result.error) {
          outputLabel.textContent = 'Error';
          outputContent.textContent = 'Error: ' + result.error;
          outputArea.classList.remove('hidden');
        }
      } catch (err) {
        outputLabel.textContent = 'Error';
        outputContent.textContent = 'Error: ' + (err.message || 'AI processing failed');
        outputArea.classList.remove('hidden');
      } finally {
        processing.classList.add('hidden');
        document.querySelectorAll('.notes-ai-btn').forEach(b => b.disabled = false);
      }
    });
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

  // Engine change — toggle local/cloud panels
  const engineSelect = document.getElementById('setting-engine');
  engineSelect.addEventListener('change', async () => {
    const engine = engineSelect.value;
    await vf.updateSettings({ engine });
    settings.engine = engine;
    toggleLocalPanel(engine === 'local');
    updateQuickStart();
    if (engine === 'local') {
      await refreshLocalSttStatus();
    }
  });

  // Local model variant change
  document.getElementById('setting-local-model').addEventListener('change', async () => {
    const variant = document.getElementById('setting-local-model').value;
    await vf.updateSettings({ localModelVariant: variant });
    settings.localModelVariant = variant;
    await refreshLocalSttStatus();
  });

  // Download model button
  document.getElementById('btn-download-model').addEventListener('click', async () => {
    const variant = document.getElementById('setting-local-model').value;
    const btn = document.getElementById('btn-download-model');
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    document.getElementById('model-progress-bar').classList.remove('hidden');

    const result = await vf.downloadLocalModel(variant);
    btn.disabled = false;

    if (result.success) {
      btn.textContent = 'Download Model';
      document.getElementById('model-progress-bar').classList.add('hidden');
      await refreshLocalSttStatus();
      updateQuickStart();
    } else {
      btn.textContent = 'Retry Download';
      document.getElementById('model-progress-label').textContent = 'Error: ' + (result.error || 'Download failed');
    }
  });

  // Delete model button
  document.getElementById('btn-delete-model').addEventListener('click', async () => {
    const variant = document.getElementById('setting-local-model').value;
    if (confirm(`Delete the ${variant} model? You can re-download it later.`)) {
      await vf.deleteLocalModel(variant);
      await refreshLocalSttStatus();
      updateQuickStart();
    }
  });

  // Listen for download progress
  vf.onModelDownloadProgress(({ percent, label }) => {
    const fill = document.getElementById('model-progress-fill');
    const lbl = document.getElementById('model-progress-label');
    if (fill) fill.style.width = percent + '%';
    if (lbl) lbl.textContent = label || (percent + '%');
  });

  // Initial panel state
  toggleLocalPanel(settings.engine === 'local');
  if (settings.engine === 'local') {
    refreshLocalSttStatus();
  }

  saveSetting('setting-language', 'language');
  saveSetting('setting-hotkey', 'hotkey');
  saveSetting('setting-output-style', 'outputStyle');
  saveSetting('setting-translate-to-english', 'translateToEnglish');
  saveSetting('setting-injection', 'injectionMode');
  saveSetting('setting-start-minimized', 'startMinimized');
  saveSetting('setting-start-windows', 'startWithWindows');
  saveSetting('setting-sounds', 'playSounds');
  saveSetting('setting-microphone', 'microphone');

  // Refresh microphone list
  document.getElementById('btn-refresh-mics').addEventListener('click', refreshMicDevices);
}

// ---- Local STT helpers ----
function toggleLocalPanel(show) {
  const panel = document.getElementById('local-stt-panel');
  const groqRow = document.getElementById('row-groq-key');
  if (show) {
    panel.classList.remove('hidden');
    groqRow.classList.add('hidden');
  } else {
    panel.classList.add('hidden');
    groqRow.classList.remove('hidden');
  }
}

async function refreshLocalSttStatus() {
  try {
    const status = await vf.getLocalSttStatus();
    const variant = document.getElementById('setting-local-model').value || 'base.en';
    const modelInfo = status.models.find(m => m.variant === variant);
    const statusEl = document.getElementById('local-model-status');
    const downloadBtn = document.getElementById('btn-download-model');
    const deleteBtn = document.getElementById('btn-delete-model');

    if (modelInfo && modelInfo.ready) {
      statusEl.textContent = 'Downloaded (' + modelInfo.totalSizeMB + ' MB)';
      statusEl.className = 'card-status ok';
      downloadBtn.textContent = 'Re-download';
      deleteBtn.classList.remove('hidden');
      window._localSttReady = status.ready;
    } else {
      const size = modelInfo ? modelInfo.totalSizeMB : '?';
      statusEl.textContent = 'Not downloaded (' + size + ' MB)';
      statusEl.className = 'card-status warn';
      downloadBtn.textContent = 'Download Model';
      deleteBtn.classList.add('hidden');
      window._localSttReady = false;
    }
  } catch (err) {
    console.error('[APP] Failed to get local STT status:', err);
    window._localSttReady = false;
  }
}

function applySettings(s) {
  setVal('setting-engine', s.engine);
  setVal('setting-groq-key', s.groqApiKey);
  setVal('setting-local-model', s.localModelVariant || 'base.en');
  setVal('setting-language', s.language);
  setVal('setting-hotkey', s.hotkey);
  setVal('setting-output-style', s.outputStyle || 'cleaned');
  setVal('setting-injection', s.injectionMode);
  setChecked('setting-translate-to-english', s.translateToEnglish);
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

// ---- Auth ----
let authMode = 'login'; // 'login' or 'signup'

async function initAuth() {
  const status = await vf.getAuthStatus();
  const authScreen = document.getElementById('auth-screen');

  if (status.loggedIn) {
    // Already logged in — hide auth screen
    authScreen.classList.add('hidden');
    return;
  }

  // Check if user has their own API key configured
  const s = await vf.getSettings();
  if (s.groqApiKey && s.groqApiKey.length > 10) {
    // Has own API key — skip auth, let them use BYOK
    authScreen.classList.add('hidden');
    return;
  }

  // Show auth screen
  authScreen.classList.remove('hidden');
  setupAuthHandlers();
}

function setupAuthHandlers() {
  const submitBtn = document.getElementById('auth-submit');
  const toggleBtn = document.getElementById('auth-toggle');
  const skipBtn = document.getElementById('auth-skip');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const switchText = document.getElementById('auth-switch-text');
  const errorEl = document.getElementById('auth-error');

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showAuthError('Please enter email and password');
      return;
    }
    if (password.length < 6) {
      showAuthError('Password must be at least 6 characters');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'login' ? 'Signing in...' : 'Creating account...';
    errorEl.classList.add('hidden');

    const result = authMode === 'login'
      ? await vf.login({ email, password })
      : await vf.signup({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';

    if (result.success) {
      document.getElementById('auth-screen').classList.add('hidden');
    } else {
      showAuthError(result.error || 'Something went wrong');
    }
  });

  // Enter key submits
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
  });

  // Toggle login/signup
  toggleBtn.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    submitBtn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    switchText.textContent = authMode === 'login' ? "Don't have an account?" : 'Already have an account?';
    toggleBtn.textContent = authMode === 'login' ? 'Create one' : 'Sign in';
    errorEl.classList.add('hidden');
  });

  // Skip — use own API key
  skipBtn.addEventListener('click', () => {
    document.getElementById('auth-screen').classList.add('hidden');
    navigateTo('settings');
  });
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ---- Onboarding ----
function initOnboarding() {
  // Show on first run only (check localStorage)
  if (localStorage.getItem('vt_onboarding_done')) return;

  const overlay = document.getElementById('onboarding-overlay');
  overlay.classList.remove('hidden');

  let _currentStep = 1;

  function showStep(n) {
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`ob-step-${i}`).classList.toggle('hidden', i !== n);
      document.getElementById(`ob-dot-${i}`).classList.toggle('active', i === n);
    }
    _currentStep = n;
  }

  document.getElementById('ob-next-1').addEventListener('click', () => showStep(2));
  document.getElementById('ob-next-2').addEventListener('click', () => showStep(3));
  document.getElementById('ob-finish').addEventListener('click', () => {
    localStorage.setItem('vt_onboarding_done', '1');
    overlay.classList.add('hidden');
  });

  // Open Groq link in browser
  document.getElementById('ob-groq-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('https://console.groq.com', '_blank');
  });
}

// ---- Usage stats ----
async function loadUsageStats() {
  const all = await vf.getHistory();
  if (!all || all.length === 0) return;

  const totalWords = all.reduce((sum, entry) => {
    return sum + (entry.text ? entry.text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);
  const totalSeconds = all.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const minutesSaved = Math.round(totalSeconds / 60 * 3); // ~3x faster than typing

  const wordsEl = document.getElementById('stat-total-words');
  const minsEl = document.getElementById('stat-minutes-saved');
  const sessionsEl = document.getElementById('stat-total-sessions');
  if (wordsEl) wordsEl.textContent = totalWords.toLocaleString();
  if (minsEl) minsEl.textContent = minutesSaved;
  if (sessionsEl) sessionsEl.textContent = all.length;
}

// ---- Auto-update banner ----
if (window.volttype?.onUpdateAvailable) {
  window.volttype.onUpdateAvailable(({ version }) => {
    const banner = document.getElementById('update-banner');
    const versionEl = document.getElementById('update-version');
    if (banner) { banner.classList.remove('hidden'); }
    if (versionEl) { versionEl.textContent = version; }
  });
}
if (window.volttype?.onUpdateDownloaded) {
  window.volttype.onUpdateDownloaded(({ version }) => {
    const banner = document.getElementById('update-banner');
    const installBtn = document.getElementById('btn-install-update');
    if (banner) { banner.classList.remove('hidden'); }
    if (installBtn) {
      installBtn.textContent = `Install v${version} & Restart`;
      installBtn.classList.remove('hidden');
    }
  });
}
