/**
 * VoltType — Electron Main Process
 *
 * Local-first Windows dictation app with global hotkey activation.
 * Uses Groq Whisper API (free) for speech-to-text.
 */
const { app, BrowserWindow, globalShortcut, ipcMain, session, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const Settings = require('./src/settings');
const History = require('./src/history');
const Dictionary = require('./src/dictionary');
const Snippets = require('./src/snippets');
const GroqSTT = require('./src/stt-groq');
const { injectText, saveForegroundWindow, cleanup: cleanupInjector } = require('./src/injector');
const { setAutoStart, getAutoStartEnabled } = require('./src/startup');
const { createIdleIcon, createRecordingIcon, createProcessingIcon } = require('./src/icons');
const HotkeyManager = require('./src/hotkey');
const TextCleaner = require('./src/text-cleaner');
const VocabLearner = require('./src/vocab-learner');
const Auth = require('./src/auth');

// Catch uncaught errors so the app doesn't silently die
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled promise rejection:', reason);
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// State
let mainWindow = null;
let overlayWindow = null;
let tray = null;
let settings = null;
let history = null;
let dictionary = null;
let snippets = null;
let sttEngine = null;
let textCleaner = null;
let vocabLearner = null;
let auth = null;
let hotkeyManager = null;
let isRecording = false;
let isTranscribing = false;  // Block new recordings while transcribing
let recordingStartTime = 0;
let currentHotkey = null;
let lastToggleTime = 0;      // Debounce protection
let recordingMode = 'hold';  // 'hold' = Ctrl+Space, 'toggle' = Ctrl+Shift+D
const TOGGLE_DEBOUNCE_MS = 500;

// Icons (created after app ready)
let iconIdle, iconRecording, iconProcessing;

// --------------------------------------------------
// App lifecycle
// --------------------------------------------------
app.whenReady().then(() => {
  // Initialize modules
  settings = new Settings();
  history = new History();
  dictionary = new Dictionary();
  snippets = new Snippets();
  sttEngine = new GroqSTT(settings.get('groqApiKey'));
  textCleaner = new TextCleaner(settings.get('groqApiKey'));
  vocabLearner = new VocabLearner();
  auth = new Auth();

  // Auto-grant microphone permission
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Create icons
  iconIdle = createIdleIcon();
  iconRecording = createRecordingIcon();
  iconProcessing = createProcessingIcon();

  createWindow();
  createOverlay();
  createTray();
  registerHotkeys();

  // Auto-update: check GitHub releases silently
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.log('[UPDATE] Check failed (no internet or no release):', err.message);
  });
  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATE] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[UPDATE] Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
    }
  });

  // Ensure overlay is hidden on startup (prevents stuck overlay from previous crash)
  hideOverlay();
  isTranscribing = false;
  isRecording = false;

  // Apply auto-start setting
  if (settings.get('startWithWindows') && !getAutoStartEnabled()) {
    setAutoStart(true);
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', (e) => {
  // Don't quit when window is closed — keep running in tray
  e?.preventDefault?.();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (hotkeyManager) hotkeyManager.stop();
  cleanupInjector();
});

// --------------------------------------------------
// Window
// --------------------------------------------------
function createWindow() {
  const startMinimized = settings.get('startMinimized') ||
    process.argv.includes('--start-minimized');

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c1222',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show window only after ready (prevents focus steal during startup)
  mainWindow.once('ready-to-show', () => {
    if (!startMinimized) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
  });

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// --------------------------------------------------
// Floating Recording Overlay
// --------------------------------------------------
function createOverlay() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 200,
    height: 50,
    x: Math.round(width / 2 - 100),
    y: 18,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
    },
  });

  // Prevent the overlay from being clicked/focused
  overlayWindow.setIgnoreMouseEvents(true);

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; }
      body {
        background: transparent;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: -apple-system, 'Segoe UI', sans-serif;
        -webkit-app-region: no-drag;
        user-select: none;
      }
      .pill {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 28px;
        font-size: 13px;
        font-weight: 600;
        color: white;
        transition: all 0.3s ease;
      }
      .recording {
        background: linear-gradient(135deg, #f87171, #ef4444);
        box-shadow: 0 4px 20px rgba(248,113,113,0.4);
      }
      .processing {
        background: linear-gradient(135deg, #38bd9c, #3b82f6);
        box-shadow: 0 4px 20px rgba(56,189,156,0.4);
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: white;
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.8); }
      }
      .hidden { display: none; }
    </style></head>
    <body>
      <div class="pill recording" id="pill">
        <div class="dot"></div>
        <span id="label">Listening...</span>
      </div>
    </body>
    </html>
  `)}`);
}

function showOverlay(mode) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.executeJavaScript(`
    document.getElementById('pill').className = 'pill ${mode}';
    document.getElementById('label').textContent = '${mode === 'recording' ? 'Listening...' : 'Transcribing...'}';
  `).catch(() => {});
  overlayWindow.showInactive();
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.hide();
}

// --------------------------------------------------
// Tray
// --------------------------------------------------
function createTray() {
  tray = new Tray(iconIdle);
  tray.setToolTip('VoltType — Ready');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open VoltType',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    {
      label: 'Start Dictation',
      click: () => toggleRecording(),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('navigate', 'settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow.destroy();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayState(state) {
  if (!tray) return;
  switch (state) {
    case 'recording':
      tray.setImage(iconRecording);
      tray.setToolTip('VoltType — Recording...');
      break;
    case 'processing':
      tray.setImage(iconProcessing);
      tray.setToolTip('VoltType — Transcribing...');
      break;
    default:
      tray.setImage(iconIdle);
      tray.setToolTip('VoltType — Ready');
  }
}

// --------------------------------------------------
// Global Hotkeys
// --------------------------------------------------
function registerHotkeys() {
  // 1. Primary: Ctrl+Space hold-to-talk
  hotkeyManager = new HotkeyManager();
  hotkeyManager.setCallbacks(
    () => { recordingMode = 'hold'; startRecording(); },   // on hold start
    () => stopRecording()                                    // on release
  );
  hotkeyManager.start();

  // 2. Secondary: toggle shortcut (Ctrl+Shift+D) for press-to-start, press-to-stop
  const hotkey = settings.get('hotkey') || 'Ctrl+Shift+D';
  const accelerator = hotkey.replace(/Ctrl/g, 'CmdOrCtrl').replace(/Win/g, 'Super');

  try {
    const success = globalShortcut.register(accelerator, () => toggleRecording());
    if (success) {
      currentHotkey = accelerator;
      console.log(`[HOTKEY] Toggle shortcut registered: ${hotkey}`);
    } else {
      console.log(`[HOTKEY] Toggle shortcut failed: ${hotkey}, trying F9`);
      if (globalShortcut.register('F9', () => toggleRecording())) {
        currentHotkey = 'F9';
        console.log('[HOTKEY] Fallback toggle: F9');
      }
    }
  } catch (e) {
    console.log(`[HOTKEY] Toggle registration error: ${e.message}`);
  }

  console.log('[HOTKEY] Ready — Hold Ctrl+Space to dictate, or toggle with ' + (currentHotkey || hotkey || 'F9'));
}

// --------------------------------------------------
// Recording toggle
// --------------------------------------------------
function toggleRecording() {
  // Debounce: ignore rapid toggles
  const now = Date.now();
  if (now - lastToggleTime < TOGGLE_DEBOUNCE_MS) {
    console.log('[HOTKEY] Toggle debounced — too fast');
    return;
  }
  lastToggleTime = now;

  console.log('[HOTKEY] Toggle recording. State:', isRecording ? 'recording' : 'idle', isTranscribing ? '(transcribing)' : '');
  if (isRecording) {
    stopRecording();
  } else {
    recordingMode = 'toggle';
    startRecording();
  }
}

function startRecording() {
  if (isRecording || isTranscribing) {
    console.log('[RECORD] Blocked — already', isRecording ? 'recording' : 'transcribing');
    return;
  }

  // Save which window has focus right now
  saveForegroundWindow();

  isRecording = true;
  recordingStartTime = Date.now();
  updateTrayState('recording');
  showOverlay('recording');
  console.log(`[RECORD] Started (${recordingMode} mode) — telling renderer to capture audio`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-state', { recording: true, mode: recordingMode });
  }
}

function stopRecording() {
  if (!isRecording) return;
  const holdDuration = Date.now() - recordingStartTime;
  isRecording = false;

  // Too short (< 0.6s) — skip, no usable audio
  if (holdDuration < 600) {
    console.log(`[RECORD] Too short (${holdDuration}ms) — skipping`);
    hideOverlay();
    updateTrayState('idle');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording-state', { recording: false, skip: true });
    }
    return;
  }

  isTranscribing = true;
  updateTrayState('processing');
  showOverlay('processing');
  console.log(`[RECORD] Stopped after ${holdDuration}ms — waiting for audio from renderer`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-state', { recording: false });
  }
}

// --------------------------------------------------
// Whisper duplicate removal
// --------------------------------------------------
function removeDuplicateSentences(text) {
  if (!text) return text;
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences || sentences.length < 2) return text;

  const seen = [];
  const result = [];
  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
    // Check if this sentence (or very similar) was already seen
    const isDuplicate = seen.some(s => {
      if (s === normalized) return true;
      // Fuzzy: if 80%+ of words match, treat as duplicate
      const words1 = s.split(' ');
      const words2 = normalized.split(' ');
      if (words1.length < 4 || words2.length < 4) return s === normalized;
      const common = words1.filter(w => words2.includes(w)).length;
      return common / Math.max(words1.length, words2.length) > 0.8;
    });

    if (!isDuplicate) {
      seen.push(normalized);
      result.push(sentence.trim());
    } else {
      console.log(`[STT] Removed duplicate: "${sentence.trim().slice(0, 50)}..."`);
    }
  }
  return result.join(' ');
}

// --------------------------------------------------
// IPC Handlers
// --------------------------------------------------

// Audio data from renderer after recording stops
ipcMain.handle('audio-captured', async (event, { audioBase64, mimeType }) => {
  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const duration = (Date.now() - recordingStartTime) / 1000;
    console.log(`[STT] Received ${Math.round(audioBuffer.length / 1024)}KB audio (${mimeType}), duration: ${duration.toFixed(1)}s`);

    // Skip very small audio (< 5KB = silence or too short)
    if (audioBuffer.length < 5000) {
      console.log('[STT] Audio too small, skipping');
      hideOverlay();
      updateTrayState('idle');
      isTranscribing = false;
      return { success: false, error: 'Too short' };
    }

    // Set auth token for Worker backend (if logged in)
    sttEngine.setAuthToken(auth.getToken());

    // Build Whisper prompt — ONLY personal terms and corrections (not recent history)
    const learnedPrompt = vocabLearner.getWhisperPrompt();
    if (learnedPrompt) console.log(`[STT] Whisper prompt: "${learnedPrompt.slice(0, 80)}..."`);

    // Transcribe (uses Worker if logged in, direct Groq if has own API key)
    const result = await sttEngine.transcribe(
      audioBuffer,
      settings.get('language'),
      mimeType,
      learnedPrompt
    );

    let text = result.text;

    // Remove duplicate sentences (Whisper repetition bug)
    text = removeDuplicateSentences(text);
    console.log(`[STT] Raw: "${text}" (${result.apiLatency}ms)`);

    // Skip empty results
    if (!text || text.trim().length === 0) {
      console.log('[STT] Empty result, skipping injection');
      hideOverlay();
      updateTrayState('idle');
      isTranscribing = false;
      return { success: true, text: '' };
    }

    // --- AI Voice Command Detection ---
    const cmdResult = textCleaner.detectCommand(text);
    if (cmdResult.isCommand) {
      console.log(`[COMMAND] Detected voice command: "${cmdResult.command}" (${cmdResult.label})`);

      // Get the last transcription from history to apply the command to
      const lastEntry = history.getRecent(1)?.[0];
      if (lastEntry && lastEntry.text) {
        // Show command indicator in overlay
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.executeJavaScript(`
            document.getElementById('pill').className = 'pill processing';
            document.getElementById('label').textContent = '${cmdResult.label}...';
          `).catch(() => {});
          overlayWindow.showInactive();
        }

        // Execute the command on the previous text
        const transformed = await textCleaner.executeCommand(
          cmdResult.command,
          lastEntry.text,
          cmdResult.extra || ''
        );

        if (transformed && transformed !== lastEntry.text) {
          console.log(`[COMMAND] Transformed: "${lastEntry.text.slice(0, 40)}..." -> "${transformed.slice(0, 40)}..."`);

          // Update history with the transformed text
          history.update(lastEntry.id, transformed);

          // Inject the transformed text
          hideOverlay();
          await injectText(transformed);

          updateTrayState('idle');
          isTranscribing = false;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcription-result', {
              text: transformed,
              duration,
              apiLatency: result.apiLatency,
              voiceCommand: cmdResult.command,
              voiceCommandLabel: cmdResult.label,
            });
          }

          return { success: true, text: transformed, voiceCommand: cmdResult.command };
        }
      } else {
        console.log('[COMMAND] No previous text to apply command to');
      }

      // If no previous text or transform failed, fall through to normal processing
      hideOverlay();
      updateTrayState('idle');
      isTranscribing = false;
      return { success: true, text: '', voiceCommand: cmdResult.command, noTarget: true };
    }

    // LLM post-processing — clean up grammar, punctuation, filler words
    const outputStyle = settings.get('outputStyle') || 'cleaned';
    const rawText = text; // Keep raw for learning comparison
    if (outputStyle !== 'raw') {
      try {
        const userContext = vocabLearner.getCleanerContext();
        const cleaned = await textCleaner.clean(text, outputStyle, userContext);
        console.log(`[STT] Cleaned: "${cleaned}"`);
        text = cleaned;
      } catch (err) {
        console.error('[STT] Cleaner failed, using raw text:', err.message);
      }
    }

    // Apply dictionary replacements
    text = dictionary.apply(text);

    // Save to history
    history.add({
      text,
      duration,
      engine: settings.get('engine'),
      language: settings.get('language'),
    });

    // Learn from this dictation (improves future accuracy)
    vocabLearner.learn(rawText, text);

    // Inject into focused app
    hideOverlay();
    await injectText(text);
    console.log('[INJECT] Done');

    updateTrayState('idle');
    isTranscribing = false;

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transcription-result', {
        text,
        duration,
        apiLatency: result.apiLatency,
      });
    }

    return { success: true, text };
  } catch (err) {
    console.error('[STT] Error:', err.message);
    hideOverlay();
    updateTrayState('idle');
    isTranscribing = false;
    // Don't show alert — just log it. User can check history.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transcription-error', { message: err.message });
    }
    return { success: false, error: err.message };
  }
});

// Settings
ipcMain.handle('get-settings', () => settings.getAll());
ipcMain.handle('update-settings', (event, partial) => {
  settings.update(partial);
  // Re-apply changed settings
  if (partial.groqApiKey !== undefined) {
    sttEngine.setApiKey(partial.groqApiKey);
    textCleaner.setApiKey(partial.groqApiKey);
  }
  if (partial.hotkey !== undefined) {
    registerHotkey();
  }
  if (partial.startWithWindows !== undefined) {
    setAutoStart(partial.startWithWindows);
  }
  return settings.getAll();
});

// History
ipcMain.handle('get-history', (event, count) => {
  return count ? history.getRecent(count) : history.getAll();
});
ipcMain.handle('clear-history', () => { history.clear(); return true; });
ipcMain.handle('delete-history-entry', (event, id) => { history.delete(id); return true; });
ipcMain.handle('edit-history-entry', (event, { id, newText }) => {
  const entry = history.get(id);
  if (entry) {
    const originalText = entry.text;
    history.update(id, newText);
    // Learn from the correction
    vocabLearner.learnCorrection(originalText, newText);
    console.log(`[LEARN] User corrected: "${originalText.slice(0, 40)}..." → "${newText.slice(0, 40)}..."`);
  }
  return true;
});

// VAD auto-stop — renderer detected silence, trigger stop
ipcMain.on('vad-auto-stop', () => {
  console.log('[VAD] Auto-stop triggered by renderer');
  stopRecording();
});

// Checkout — open Stripe payment in browser
ipcMain.handle('checkout', async (event, plan) => {
  const token = auth.getToken();
  if (!token) return { success: false, error: 'Not logged in' };

  try {
    const { net, shell } = require('electron');
    const res = await net.fetch('https://volttype-api.crcaway.workers.dev/v1/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      shell.openExternal(data.url); // Opens Stripe checkout in browser
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to create checkout' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Usage check
ipcMain.handle('get-usage', async () => {
  const token = auth.getToken();
  if (!token) return null;

  try {
    const { net } = require('electron');
    const res = await net.fetch('https://volttype-api.crcaway.workers.dev/v1/usage', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return await res.json();
  } catch {
    return null;
  }
});

// Auth
ipcMain.handle('auth-login', async (event, { email, password }) => {
  try {
    await auth.login(email, password);
    return { success: true, user: auth.getUser() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('auth-signup', async (event, { email, password }) => {
  try {
    await auth.signup(email, password);
    return { success: true, user: auth.getUser() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('auth-logout', () => { auth.logout(); return true; });
ipcMain.handle('auth-status', () => ({
  loggedIn: auth.isLoggedIn(),
  user: auth.getUser(),
}));
ipcMain.handle('auth-token', () => auth.getToken());

// Vocabulary learner
ipcMain.handle('get-vocab-stats', () => vocabLearner.getStats());
ipcMain.handle('get-vocab-terms', () => vocabLearner.getTerms());
ipcMain.handle('add-vocab-term', (event, term) => { vocabLearner.addTerm(term); return vocabLearner.getTerms(); });
ipcMain.handle('remove-vocab-term', (event, term) => { vocabLearner.removeTerm(term); return vocabLearner.getTerms(); });

// Dictionary
ipcMain.handle('get-dictionary', () => dictionary.getAll());
ipcMain.handle('add-dictionary-rule', (event, { from, to, type }) => {
  dictionary.add(from, to, type);
  return dictionary.getAll();
});
ipcMain.handle('update-dictionary-rule', (event, { index, updates }) => {
  dictionary.update(index, updates);
  return dictionary.getAll();
});
ipcMain.handle('remove-dictionary-rule', (event, index) => {
  dictionary.remove(index);
  return dictionary.getAll();
});

// Snippets
ipcMain.handle('get-snippets', () => snippets.getAll());
ipcMain.handle('add-snippet', (event, { name, text, category }) => {
  snippets.add(name, text, category);
  return snippets.getAll();
});
ipcMain.handle('update-snippet', (event, { id, updates }) => {
  snippets.update(id, updates);
  return snippets.getAll();
});
ipcMain.handle('remove-snippet', (event, id) => {
  snippets.remove(id);
  return snippets.getAll();
});
ipcMain.handle('inject-snippet', async (event, id) => {
  const snippet = snippets.get(id);
  if (snippet) {
    await injectText(snippet.text, settings.get('injectionMode'));
    return true;
  }
  return false;
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.hide());

// Recording state query
ipcMain.handle('get-recording-state', () => isRecording);

// Get app info
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  dataPath: app.getPath('userData'),
  platform: process.platform,
  isAutoStartEnabled: getAutoStartEnabled(),
}));

// Install downloaded update
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
