# VoltType — Comprehensive Architecture Overview

**Last Updated:** 2026-04-07  
**For:** New developers joining the project

---

## 1. PROJECT OVERVIEW

**VoltType** is an AI-powered voice typing application for Windows that lets users speak into any application and have their speech automatically transcribed, cleaned up, and injected as text.

### Core Value Proposition
- **Hold-to-talk** (`Ctrl+Space`): Records while key is held, transcribes on release
- **Toggle mode** (`Ctrl+Shift+D`): Press to start, auto-stops after 1.5s silence
- **AI workflows**: Transform speech into summaries, bullet points, or formal text
- **Local-first**: Settings, history, snippets, and vocabulary stored on device
- **Free tier**: 10 minutes/day using Groq's free Whisper API

---

## 2. ARCHITECTURE OVERVIEW

### High-Level Flow

```
User speaks → Microphone captured → Audio sent to Groq Whisper API →
Text received → Dictionary corrections applied → AI cleanup (optional) →
Text injected into focused application
```

### Tech Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop App** | Electron 35 | Windows application framework |
| **Audio Capture** | Web Audio API + Voice Activity Detection (VAD) | Microphone input + auto-stop detection |
| **Hotkey** | uiohook-napi (global system hotkeys) | Ctrl+Space, Ctrl+Shift+D capture |
| **Speech Recognition** | Groq Whisper API | Free STT engine |
| **LLM Processing** | Groq LLM (llama-3.3-70b) | Text cleanup, rewriting, AI commands |
| **Backend API** | Cloudflare Workers | Auth, usage tracking, payment proxy |
| **Database** | Supabase PostgreSQL | User profiles, usage logs, subscriptions |
| **Auth** | Supabase Auth (email/password + Google OAuth) | User authentication |
| **Payment** | Stripe | Subscription billing |
| **Mobile** | Expo/React Native | Cross-platform mobile app (Android-first) |
| **Landing Page** | Static HTML/CSS/JS + PWA | https://volttype.com (Cloudflare Pages) |

---

## 3. APPLICATION STRUCTURE

### Directory Layout

```
VoltType/
├── main.js                       ← Electron main process (entry point)
├── preload.js                    ← IPC bridge (secure communication)
├── start.js                      ← Auto-restart launcher with watchdog
├── package.json                  ← Dependencies: electron, electron-updater
├── build/
│   ├── icon.ico                  ← Windows task bar & installer icon
│   ├── icon.png                  ← macOS  + Electron packaging
│   └── icon.svg                  ← Source for icon generation
├── dist/                         ← Built .exe files (ignored, created by build)
├── src/                          ← Core business logic (required by main.js)
│   ├── auth.js                   ← Supabase authentication (login/signup/refresh)
│   ├── settings.js               ← Settings persistence (JSON: hotkey, API key, theme)
│   ├── history.js                ← Dictation history (JSON: 200-entry max)
│   ├── dictionary.js             ← Word bank / custom corrections (JSON rules)
│   ├── snippets.js               ← Text templates (JSON: saved blocks)
│   ├── vocab-learner.js          ← Learns from user corrections (builds prompts)
│   ├── hotkey.js                 ← Global hotkey manager (Ctrl+Space, Ctrl+Shift+D)
│   ├── stt-groq.js               ← Speech-to-text via Groq Whisper API
│   ├── text-cleaner.js           ← LLM post-processing (punctuation, grammar)
│   ├── injector.js               ← Windows text injection (clipboard + Ctrl+V)
│   ├── icons.js                  ← Tray icon generation (idle/recording/processing)
│   ├── startup.js                ← Windows auto-start setup
│   └── png-utils.js              ← PNG encoding helper
├── renderer/                     ← Electron UI (preload-exposed via IPC bridge)
│   ├── index.html                ← Main app interface (pages: home, dictionary, snippets, etc.)
│   ├── app.js                    ← UI navigation & page event handlers
│   ├── audio.js                  ← Audio capture + VAD implementation
│   └── styles.css                ← Dark-mode UI styling
├── backend/cloudflare-worker/    ← API backend
│   ├── wrangler.toml             ← Cloudflare Worker config
│   ├── package.json
│   └── src/
│       ├── index.js              ← Main router (POST /v1/transcribe, /v1/clean, etc.)
│       ├── auth.js               ← JWT verification (calls Supabase)
│       ├── cors.js               ← CORS headers for volttype.com + Electron
│       ├── groq-proxy.js         ← Proxies transcribe/clean to Groq API
│       └── usage.js              ← Calls Supabase RPC to log & check usage limits
├── android/                      ← React Native app (Expo)
│   ├── App.js                    ← Navigation (Login → Home → Settings)
│   ├── app.json                  ← Expo config
│   ├── package.json              ← Dependencies: react-native, expo-av (audio)
│   └── src/
│       ├── screens/
│       │   ├── LoginScreen.js
│       │   ├── HomeScreen.js     ← Record & transcribe UI
│       │   └── SettingsScreen.js
│       └── services/
│           ├── auth.js           ← Supabase auth (mirrors desktop)
│           └── api.js            ← Calls worker API
├── website/                      ← Landing page (deployed to volttype.com)
│   ├── index.html                ← Main landing page (SEO optimized)
│   ├── privacy-policy.html
│   ├── terms-of-service.html
│   ├── ai-voice-typing-windows.html
│   ├── ai-notes-from-voice.html
│   ├── speech-to-text-for-windows.html
│   ├── admin.html                ← Admin panel (usage dashboard)
│   ├── manifest.json             ← PWA manifest
│   ├── sw.js                     ← Service worker (offline support)
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── og-image.png              ← OpenGraph for social sharing
│   └── icons/                    ← PWA icons (192px, 512px)
├── pwa/                          ← Alternate PWA assets
├── scripts/
│   ├── generate-icon.js          ← Generates app icon (dark + teal voice wave)
│   └── download-model.js         ← (Placeholder) For local Whisper model
└── Documentation
    ├── README.md                 ← Quick start guide
    ├── HANDOVER.md               ← Current state & launch checklist
    ├── ARCHITECTURE_OVERVIEW.md  ← This file
    ├── AUDIT_MASTER_PROMPT.md
    ├── BUILDER_PROMPT.md
    ├── CLAUDE_CODE_MASTER_PROMPT.md
    └── MOBILE_ROADMAP.md
```

---

## 4. ELECTRON APPLICATION LIFECYCLE

### Entry Point: `main.js`

**What it does:**
- Initializes all core modules (Settings, History, Dictionary, Auth, STT engine)
- Creates Electron windows (main app window + overlay)
- Registers global hotkeys
- Sets up IPC handlers for renderer ↔ main communication
- Manages auto-update via electron-updater

**Key State Variables:**
```javascript
let isRecording = false;           // Currently recording
let isTranscribing = false;        // Audio processing (blocks new recordings)
let recordingMode = 'hold';        // 'hold' | 'toggle'
let hotkeyManager = null;          // Global hotkey handler
let sttEngine = null;              // Groq API encoder
```

**Windows Created:**
1. **Main Window** (`mainWindow`) — Frameless, stays minimized by default
2. **Overlay Window** (`overlayWindow`) — Transparent recording indicator shown during recording
3. **Tray Icon** (`tray`) — Windows system tray control

### Launch Flow via `start.js`

**Purpose:** Auto-restart watchdog for crash recovery

```javascript
spawn(electronPath, ['.'], { stdio: 'inherit' })
  → Monitors exit code
  → Restarts up to 5 times within 30s window
  → After 30s stable run, resets counter
  → Max 5 restarts prevents infinite crash loops
```

**When to use `npm start` vs `npm run dev`:**
- `npm start` → Production-like (auto-restart enabled)
- `npm run dev` → Dev mode (no auto-restart, easier debugging)

---

## 5. RECORDING & TRANSCRIPTION FLOW

### 1. **Hotkey Activated** → [hotkey.js]

```
User presses & holds Ctrl+Space
  ↓
uIOhook detects keydown (with debounce check)
  ↓
Calls hotkeyManager._onStart() callback
  ↓
isRecording = true, overlay appears, start tone plays
```

**Hotkey Config:**
- **Default**: `Ctrl+Space` (hold-to-talk) — ergonomic, not intercepted by Windows
- **Alternative**: `Ctrl+Shift+D` (toggle mode) — press to start, auto-stop via VAD after 1.5s silence
- **Why not Win?** Windows intercepts ALL Win+X combos at OS level

### 2. **Audio Captured** → [renderer/audio.js]

**AudioCapture Class:**
- Uses WebRTC `getUserMedia` → captures raw PCM
- **Pre-warming**: Keeps a stream ready to eliminate 200-500ms startup delay
- **VAD (Voice Activity Detection)**:
  - RMS level analysis to detect silence
  - If silence > 1.5s → auto-stop in toggle mode
  - Live level feedback for waveform visualization

**Audio Encoding:**
- MediaRecorder encodes to WebM (VP8 + Opus)
- Sends Buffer via IPC → main process

### 3. **Transcription** → [src/stt-groq.js]

**Two paths:**

| **If User Logged In** | **If Manual API Key** |
|----------------------|----------------------|
| Uses Worker proxy (`volttype-api.workers.dev`) | Direct to Groq API |
| Auth: Supabase JWT in `Authorization` header | Auth: API key in request header |
| No personal key stored locally | Key stored in `settings.json` |

**Groq Request Structure:**
```
POST https://api.groq.com/openai/v1/audio/transcriptions
  - file: audio.webm
  - model: whisper-large-v3-turbo
  - language: en (or user's selected language)
  - prompt: [optional] user's learned vocabulary context
```

**Result:**
```json
{
  "text": "Hello world",
  "duration": 5.2  // seconds of audio
}
```

### 4. **Dictionary Corrections** → [src/dictionary.js]

Post-transcription rules applied **before** LLM cleanup:
```javascript
{
  find: "GPT",
  replace: "ChatGPT"  // Custom replacements for acronyms, names
}
```

No persistent storage unless user creates rules.

### 5. **AI Cleanup** → [src/text-cleaner.js]

Configurable output styles:
- **Raw**: Exact transcription, no changes
- **Punctuated** (default): Adds periods, commas, quotes
- **Cleaned**: Full grammar/punctuation rewrite (changes meaning)

Requests LLM:
```
"Add proper punctuation and capitalization: 'hello world'"
→ "Hello, world."
```

### 6. **Text Injection** → [src/injector.js]

**Windows-specific approach:**
1. Saves the focused window's HWND (handle) **before** recording starts
2. On transcription complete:
   - Sets text to Windows clipboard
   - Uses PowerShell to call Win32 `SetForegroundWindow()` API
   - Sends `Ctrl+V` via SendKeys
   - Restores previous clipboard after 600ms

**Why not direct keystroke injection?**
- More reliable with different text editors (Web, Office, IDE)
- Works across security boundaries (Chrome, Word, etc.)
- Clipboard-based is standard for Windows automation

---

## 6. DATA PERSISTENCE

All data stored in `%APPDATA%/volttype/` (managed by Electron's `app.getPath('userData')`):

| **File** | **Purpose** | **Format** | **Max Size** |
|----------|-----------|-----------|-------------|
| `settings.json` | User config (hotkey, API key, theme) | JSON, versioned | ~5KB |
| `history.json` | Last 200 transcriptions | JSON array | ~1MB |
| `dictionary.json` | Custom word replacements | JSON array of rules | ~100KB |
| `snippets.json` | Saved text templates | JSON array | ~500KB |
| `vocab.json` | Learned vocabulary for prompts | JSON object | ~200KB |
| `auth.json` | Supabase token + refresh | JSON (auto-managed) | ~5KB |

**Schema Versioning:**
```javascript
// settings.js
const SCHEMA_VERSION = 3;
if ((raw.version || 0) < 3 && raw.outputStyle === 'cleaned') {
  this._data.outputStyle = 'punctuated';  // Auto-migrate
  this.save();
}
```

**First-Run Detection:**
- If `settings.json` doesn't exist → auto-detect Groq API key from `.env.master`
- If not found → user must add API key in settings (or sign in via Supabase)

---

## 7. AUTHENTICATION & AUTHORIZATION

### Desktop Auth Flow

[src/auth.js] implements Supabase Auth via REST API:

```javascript
// Signup
POST https://ceuymixybyaxpldgggin.supabase.co/auth/v1/signup
  { email, password }
  → Creates user in `auth.users` table
  → Trigger: `volttype_handle_new_user()` auto-creates profile

// Login
POST https://ceuymixybyaxpldgggin.supabase.co/auth/v1/token?grant_type=password
  { email, password }
  → Returns access_token + refresh_token

// Token storage
~/.volttype/auth.json
  {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "expires_at": 1712345678,
    "user": { "id": "...", "email": "..." }
  }
```

**Auto-Refresh:**
- Scheduled 60s before expiry
- Falls back to manual refresh if missed

### Mobile Auth Flow

[android/src/services/auth.js] mirrors desktop:
- Same Supabase instance + API
- AsyncStorage instead of file system
- Same token refresh logic

### Worker API Auth

[backend/cloudflare-worker/src/auth.js]:
```javascript
// Expects: Authorization: Bearer <JWT>
// Calls Supabase to verify token
→ Returns user.id + email
```

---

## 8. BACKEND API (CLOUDFLARE WORKER)

**Base URL**: `https://volttype-api.crcaway.workers.dev`

### Endpoints

#### POST /v1/transcribe
```
Header: Authorization: Bearer <JWT>
Body: FormData with audio file

Response: {
  "text": "Hello world",
  "duration": 5.2,
  "usage": {
    "thisRequest": 5.2,
    "remaining": 600  // seconds left this plan
  }
}
```

**Rate Limit**: Daily limits per plan:
- Free: 600 seconds (10 min)
- Basic: 1800 seconds (30 min)
- Pro: Unlimited

#### POST /v1/clean
```
Header: Authorization: Bearer <JWT>
Body: { "text": "hello world" }

Response: { "text": "Hello, world." }
```

#### POST /v1/command
```
Header: Authorization: Bearer <JWT>
Body: { "text": "hello world", "command": "make formal" }

Response: { "text": "Good morning.", "command": "make formal" }
```

#### GET /v1/usage
```
Header: Authorization: Bearer <JWT>

Response: {
  "plan": "Basic",
  "usedSeconds": 123,
  "limitSeconds": 1800,
  "remainingSeconds": 1677
}
```

#### POST /v1/checkout
```
Header: Authorization: Bearer <JWT>
Body: { "plan": "basic" }

Response: { "url": "https://checkout.stripe.com/..." }
```

### Cloudflare Worker Configuration

**wrangler.toml:**
```toml
[env.production]
vars = { SUPABASE_URL = "https://ceuymixybyaxpldgggin.supabase.co" }

[secrets] (set via `wrangler secret put KEY`)
- GROQ_API_KEY
- SUPABASE_SERVICE_KEY
- SUPABASE_JWT_SECRET
- STRIPE_SECRET_KEY
- STRIPE_PRICE_BASIC
- STRIPE_PRICE_PRO
```

---

## 9. SUPABASE DATABASE SCHEMA

**Project ID**: `ceuymixybyaxpldgggin`

### Tables

#### volttype_profiles
```sql
id (uuid, PK)
email (text, unique)
display_name (text)
plan (text) — 'free' | 'basic' | 'pro'
stripe_customer_id (text, nullable)
created_at (timestamptz)
updated_at (timestamptz)
```

#### volttype_usage
```sql
id (uuid, PK)
user_id (uuid, FK → auth.users.id)
date (date) — YYYY-MM-DD
seconds_used (int) — cumulative per day
engine (text) — 'whisper-large-v3-turbo' | 'llama-3.3-70b'
operation (text) — 'transcribe' | 'clean' | 'command'
created_at (timestamptz)
```

#### volttype_subscriptions
```sql
id (uuid, PK)
user_id (uuid, FK)
stripe_subscription_id (text)
plan (text)
status (text) — 'active' | 'cancelled' | 'past_due'
current_period_start (timestamptz)
current_period_end (timestamptz)
created_at (timestamptz)
updated_at (timestamptz)
```

#### volttype_webhook_events
```sql
event_id (text, PK)
event_type (text)
processed_at (timestamptz)
```

### Triggers & Functions

**on_volttype_user_created**:
```sql
AFTER INSERT on auth.users
FOR EACH ROW
  CALL volttype_handle_new_user(NEW.id, NEW.email)
  — Auto-creates profile with plan='free'
```

### RPC Functions

```sql
volttype_get_plan(user_id uuid)
  → Returns current plan

volttype_get_daily_usage(user_id uuid, date date)
  → Returns seconds used that day

volttype_log_usage(user_id, seconds, engine, operation)
  → Inserts usage record
```

---

## 10. AUDIO CAPTURE & VAD IMPLEMENTATION

### Audio Encoding Pipeline

```
getUserMedia { audio: { sampleRate: 48000, channelCount: 1 } }
  ↓
MediaRecorder (WebM/VP8 + Opus)
  ↓
Chunks accumulated
  ↓
On stop: Concatenate chunks → Uint8Array → Buffer (for IPC)
```

### Voice Activity Detection (VAD)

**Purpose**: Auto-stop recording when user pauses (toggle mode)

**Algorithm** (in `renderer/audio.js`):
```javascript
// Analyze audio frequency domain
const analyser = audioContext.createAnalyser();
analyser.fftSize = 2048;

// Get raw frequency bins
const dataArray = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(dataArray);

// Calculate RMS (root mean square) as proxy for audio level
const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val*val) / dataArray.length);
```

**Silence Detection**:
```javascript
if (rms < _silenceThreshold) {
  _silenceStart += 100ms;  // Accumulated silence
  if (_silenceStart > 1500ms) {
    onSilenceStop();  // Trigger auto-stop
  }
} else {
  _silenceStart = 0;  // Reset on sound
}
```

**Waveform Visualization**:
```javascript
// Live level updates trigger canvas redraw
updateAudioLevel(level) → drawWaveform()
  — 128-sample rolling history
  — Exponential smoothing for glow effect
  — Updates every 100ms
```

---

## 11. IPC BRIDGE (Electron ↔ Safe Communication)

All communication between main process and renderer goes through [preload.js]:

### Recording Commands
```javascript
// Renderer → Main
volttype.sendAudioCaptured(buffer)  // Send recorded audio
volttype.vadAutoStop()              // Signal VAD auto-stop

// Main → Renderer
onRecordingState({ isRecording, isTranscribing })
onTranscriptionResult({ text, duration })
onTranscriptionError({ error })
```

### Settings & Data
```javascript
// Async invoke (returns Promise)
await volttype.getSettings()
await volttype.updateSettings({ hotkey: 'Ctrl+Shift+D' })
await volttype.getHistory(20)
await volttype.addDictionaryRule({ find, replace })
```

### Authentication
```javascript
await volttype.login({ email, password })
await volttype.signup({ email, password })
await volttype.logout()
await volttype.getAuthStatus()
```

**Security**: No `nodeIntegration`, context-isolated preload script, explicit method whitelist.

---

## 12. KEY PATTERNS & CONVENTIONS

### State Management Pattern

**No global state framework** — intentional simplicity:

```javascript
// Per-module approach (settings.js, history.js, etc.)
class Settings {
  constructor() {
    this._data = { ...DEFAULTS };
    this._load();  // From disk
  }
  
  save() {
    fs.writeFileSync(this._path, JSON.stringify(this._data));
  }
  
  get(key) { return this._data[key]; }
  set(key, value) { this._data[key] = value; this.save(); }
}
```

**Why?**
- Desktop app, not web SPA — no need for Redux/Vuex
- File-backed persistence naturally
- Minimal bundle size
- Easy to unit test

### Error Handling Pattern

```javascript
// Defensive, non-crashing design
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err.message);
  // Log but don't exit — start.js will auto-restart
});

// Recording state machine
if (isRecording && isTranscribing) {
  console.log('Ignoring request — already transcribing');
  return;  // Prevent race conditions
}
```

### Async Operation Queueing

```javascript
// From renderer/app.js
let recordingOpQueue = Promise.resolve();  // Promise chain

async function startRecording() {
  recordingOpQueue = recordingOpQueue
    .then(() => audio.start())
    .catch(err => handleError(err));
}

async function stopRecording() {
  recordingOpQueue = recordingOpQueue
    .then(() => audio.stop())
    .catch(err => handleError(err));
}
// Serializes operations safely
```

### Settings Schema Versioning

```javascript
const SCHEMA_VERSION = 3;

_load() {
  const raw = JSON.parse(fs.readFileSync(path));
  
  // Merge with defaults to pick up new keys
  this._data = { ...DEFAULTS, ...raw, version: SCHEMA_VERSION };
  
  // Migrate old formats
  if ((raw.version || 0) < 3 && raw.outputStyle === 'cleaned') {
    this._data.outputStyle = 'punctuated';
    this.save();
  }
}
```

---

## 13. TYPICAL DEVELOPMENT WORKFLOWS

### Adding a New Setting

1. **Define in defaults** (`src/settings.js`):
   ```javascript
   const DEFAULTS = {
     outputStyle: 'punctuated',
     newSetting: 'defaultValue',  // ← Add here
   };
   ```

2. **Create UI control** (`renderer/index.html`):
   ```html
   <input type="checkbox" id="new-setting-input" />
   ```

3. **Handle in renderer** (`renderer/app.js`):
   ```javascript
   document.getElementById('new-setting-input').addEventListener('change', (e) => {
     vf.updateSettings({ newSetting: e.target.value });
   });
   ```

4. **Use in main** (`main.js`):
   ```javascript
   if (settings.get('newSetting') === 'someValue') {
     doSomething();
   }
   ```

### Adding a New IPC Handler

1. **Expose in preload** (`preload.js`):
   ```javascript
   contextBridge.exposeInMainWorld('volttype', {
     myNewMethod: () => ipcRenderer.invoke('my-handler', ...),
   });
   ```

2. **Implement in main** (`main.js`):
   ```javascript
   ipcMain.handle('my-handler', async (event, arg) => {
     return await doSomething(arg);
   });
   ```

3. **Call from renderer** (`renderer/app.js`):
   ```javascript
   const result = await vf.myNewMethod(data);
   ```

### Debugging

```bash
# Dev mode (no auto-restart)
npm run dev

# Check console output
# Main process: terminal where npm start runs
# Renderer: DevTools (not exposed in production build)

# Manually open DevTools
mainWindow.webContents.openDevTools();
```

---

## 14. POTENTIAL PAIN POINTS & GOTCHAS

### 1. **Microphone Permission**
- **Issue**: First-time users must grant microphone permission in Windows
- **Solution**: `settings.setPermissionRequestHandler()` auto-grants on request
- **Test**: Revoke in Windows Settings → Sound → Permissions → Manage

### 2. **Focus Window Lost During Recording**
- **Issue**: If user Alt+Tab during recording, text injects into wrong app
- **Solution**: HWND saved at start time; overlay prevents Tab switching during recording
- **Workaround**: User can manually paste if injection fails

### 3. **Hotkey Conflicts**
- **Issue**: `Ctrl+Space` conflicts with input method switching (CJK users)
- **Solution**: Dropdown to choose alternate (Ctrl+Shift+D, F9, F10)
- **Tip**: uIOhook is global; test with different apps (Chrome, Word, Discord)

### 4. **Groq API Rate Limits**
- **Issue**: Free tier is 20 requests/minute
- **Solution**: Queue recordings; ignore if already transcribing
- **Monitor**: Check [groq.com/docs](https://groq.com/docs) for current limits

### 5. **VAD Sensitivity**
- **Issue**: Too aggressive → cuts off while user is speaking; too lenient → waits too long
- **Current**: 1.5s silence threshold + RMS < 12 (tuned by testing)
- **Adjustment**: Edit `sst-groq` + test with recording + playback

### 6. **Text Injection Reliability**
- **Issue**: Some apps (Chrome secure fields, password managers) block Win32 APIs
- **Solution**: Text stays in clipboard for manual Ctrl+V
- **Debug**: PowerShell `SetForegroundWindow()` may fail silently or timeout

### 7. **Auto-Update Stuck**
- **Issue**: Old version runs; new version won't install
- **Solution**: Delete `~/.volttype/electron-updater` + restart
- **Check**: `npm run build` creates new .exe locally for testing

### 8. **Supabase Connection Failures**
- **Issue**: No internet → auth fails, Groq API unreachable
- **Solution**: Use offline mode (API key in settings)
- **Fallback**: History + vocabulary still available locally

### 9. **Stripe Webhook Mis-Configuration**
- **Issue**: Subscription events miss the worker; usage limits don't sync
- **Solution**: Verify webhook endpoint in Stripe dashboard
- **Current**: Configured for `volttype-api.crcaway.workers.dev/v1/webhooks/stripe`

### 10. **Cross-Platform Audio Encoding**
- **Issue**: WebM codec not available on some older Windows versions
- **Solution**: MediaRecorder auto-chooses best available codec
- **Fallback**: Browser defaults to WAV if needed

---

## 15. DEPLOYMENT CHECKLIST

### Desktop App Release
- [ ] Update version in `package.json`
- [ ] Run `npm run build` → generates `dist/VoltType-*.exe`
- [ ] Test on clean Windows VM
- [ ] Create GitHub release at `volttype-releases`
- [ ] Upload .exe
- [ ] Users auto-update via electron-updater

### Backend Deployment
```bash
cd backend/cloudflare-worker/
wrangler deploy
```

### Website Deployment
```bash
git add website/
git commit -m "msg"
git push  # Cloudflare Pages auto-deploys
```

### Database Migrations
- Supabase dashboard → SQL editor
- Create migration SQL
- Test on staging (`ceuymixybyaxpldgggin`)

---

## 16. USEFUL COMMANDS

```bash
# Development
npm install                      # Install dependencies
npm start                        # Run with auto-restart
npm run dev                      # Run without auto-restart (dev mode)

# Building
npm run build                    # Build Windows .exe
npm run build:portable           # Build portable .exe (no installer)
npm run build:mac                # Build macOS .dmg

# Utilities
node scripts/generate-icon.js    # Generate app icon

# Backend deployment
cd backend/cloudflare-worker/
npx wrangler deploy              # Deploy worker to Cloudflare

# Android build
cd android/
npm install
npx eas build --platform android --profile production
```

---

## 17. EXTERNAL SERVICES & CREDENTIALS

| Service | Purpose | Credential | Status |
|---------|---------|-----------|--------|
| **Groq** | STT + LLM API | API key in `.env.master` | ✅ Active |
| **Supabase** | Auth + Database | `ceuymixybyaxpldgggin` | ✅ Active |
| **Stripe** | Payments | Secret key in Cloudflare secrets | ✅ Live (testing) |
| **Cloudflare** | Workers + Pages | Wrangler CLI auth | ✅ Active |
| **GitHub** | Source + Releases | `chrchevdj` org | ✅ Active |

**All credentials in**: `C:\Users\crcaw\Desktop\Freelancing\.env.master`

---

## 18. ONBOARDING CHECKLIST FOR NEW DEVELOPERS

- [ ] Clone repo: `git clone https://github.com/chrchevdj/volttype`
- [ ] Copy `.env.master` to workspace (for local development)
- [ ] Install Node.js v18+
- [ ] Run `npm install`
- [ ] Run `npm start` → test hold `Ctrl+Space` 
- [ ] Check settings → configure Groq API key or sign in
- [ ] Read this document fully
- [ ] Review `HANDOVER.md` for current status
- [ ] Explore `src/` modules one by one
- [ ] Set up Supabase CLI for database work
- [ ] Join Slack/Discord for questions
- [ ] Run `npm run build` locally to test packaging

---

## 19. ARCHITECTURE DIAGRAMS

### Data Flow Diagram

```
[User]
  ↓ Ctrl+Space (hold)
[Hotkey Manager]
  ↓ triggers start
[Audio Capture] (Web Audio API + MediaRecorder)
  ↓ user releases key
[Audio Buffer] → [Groq STT API] via [Supabase JWT or API key]
  ↓
[Transcribed Text] → [Dictionary Rules] → [LLM Cleanup]
  ↓
[Final Text] → [Windows Text Injector] (SetForegroundWindow + Ctrl+V)
  ↓
[Focused Application] (receives pasted text)
  ↓
[Usage Logged] (Supabase RPCs for daily limits)
  ↓
[History Stored] (~/.volttype/history.json)
```

### Component Dependency Graph

```
main.js (orchestrator)
├── Settings ────────────┐
├── History              ├─→ File System (~/.volttype)
├── Dictionary           ┘
├── Snippets
├── VocabLearner
├── Auth ────────────────┬─→ Supabase Auth API
├── GroqSTT ─────────────┼─→ Groq API / Cloudflare Worker
├── TextCleaner ─────────┤
├── HotkeyManager ───────┴─→ uIOhook (global system)
├── Injector ────────────→ Windows API (via PowerShell)
└── Electron
    ├── createWindow (renderer)
    │   ├── app.js
    │   ├── audio.js
    │   └── styles.css
    ├── IPC Bridge (preload.js)
    └── Tray Menu
```

---

## 20. RESOURCES & NEXT STEPS

**Official Docs:**
- [Electron](https://www.electronjs.org/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Groq API](https://console.groq.com/docs)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

**Key Files to Deep-Dive First:**
1. [main.js](main.js) — Understand app lifecycle
2. [src/settings.js](src/settings.js) — State persistence pattern
3. [renderer/app.js](renderer/app.js) — UI event handling
4. [src/hotkey.js](src/hotkey.js) — Global hotkey handler
5. [backend/cloudflare-worker/src/index.js](backend/cloudflare-worker/src/index.js) — API routes

**Typical First Task:**
- Add a new setting (e.g., "always minimize to tray")
- Add a new hotkey option
- Create a UI component test

---

**Document Updated:** 2026-04-07  
**Maintainer:** (@chrchevdj)  
**License:** UNLICENSED (Private)

