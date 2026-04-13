# VoltType Development Guidelines

**VoltType** is a voice-first AI workspace for Windows—hold a hotkey, speak, and turn rough speech into writing, summaries, and notes. This is an Electron desktop app with Groq STT, Cloudflare Worker backend, Supabase auth, and React Native mobile (Android-first).

For detailed architecture, see [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md).

## Getting Started

```bash
npm install
npm start              # Launch dev build with auto-restart on crash
npm run dev           # Clean dev without auto-restart
npm run build         # Package to .exe installer
npm run build:portable # Portable .exe (no installer)
```

## Project Structure

| Layer | Path | Purpose |
|-------|------|---------|
| **Desktop** | `main.js`, `renderer/`, `src/` | Electron app: hotkeys, audio, injection, UI |
| **Backend** | `backend/cloudflare-worker/` | Auth, Groq proxy, usage limits, Stripe payments |
| **Mobile** | `android/` | React Native (Expo) entry point |
| **Web** | `website/`, `pwa/` | Marketing site + PWA wrapper |
| **Config** | `~/.volttype/` (user home) | `settings.json`, `history.json`, `dictionary.json`, `vocab.json` |

## Architecture Essentials

### Three-Window UI Model
- **Main window**: Minimized by default, shown on first recording
- **Recording overlay**: Minimal indicator while Ctrl+Space is held
- **Tray menu**: Access settings, history, stop recording

### Data Flow
```
User speaks → Audio captured (Web Audio API + VAD) → 
Groq STT → Dictionary corrections → Optional AI cleanup → 
Text injection via Windows clipboard/PowerShell
```

### State Management (File-Backed)
No Redux/Vuex. Per-module JSON files in `~/.volttype/`:
- `settings.json` — User config (hotkey alternatives, output mode, UI theme)
- `history.json` — Past recordings (for undo/review)
- `dictionary.json` — Word replacements (names, acronyms, punctuation)
- `vocab.json` — Learned vocabulary (auto-updated on corrections)
- `snippets.json` — Saved text blocks (templates)

## Code Conventions

### Module Organization
- **`src/hotkey.js`** — Global hotkey capture (uIOHook)
- **`renderer/audio.js`** — Audio capture + VAD (silence detection)
- **`src/injector.js`** — Windows text injection (clipboard + PowerShell)
- **`src/stt-groq.js`** — Groq Whisper API client
- **`renderer/app.js`** — Vue-like navigation (7 pages; no framework)
- **`src/settings.js`** — Settings I/O with schema versioning
- **`main.js`** — Orchestrates all modules + IPC bridge

### IPC Security
- Preload bridge in `preload.js` whitelists safe IPC channels
- No `nodeIntegration` (prevents XSS + unauthorized Node access)
- Sensitive operations (auth, file I/O) stay in main process

### Frontend (HTML/CSS/JS, no framework)
- Pure DOM manipulation for app shell
- Custom routing in `renderer/app.js` (7 views: Home, Dictionary, Snippets, History, Settings, etc.)
- State updates via IPC calls to main process
- Styles in `renderer/styles.css` (BEM-like naming)

### Backend (Cloudflare Worker)
Endpoints at `https://volttype-api.crcaway.workers.dev/v1/`:
- `POST /transcribe` — Send audio, get transcription
- `POST /clean` — AI text normalization
- `POST /command` — Voice commands ("make formal", "fix typos")
- `GET /usage` — Check daily limit (free tier: 10 min/day)
- `POST /checkout` — Stripe payment link
- All endpoints require Bearer token in `Authorization` header

## Critical Gotchas

1. **Microphone Window Focus**: App saves the `HWND` at recording start. If user Alt+Tabs during recording, text injects into the new window.
   - **Workaround**: Pause before Alt+Tab, or check focused app in alt-tab hook.

2. **Hotkey Conflicts**: `Ctrl+Space` conflicts with CJK (Chinese/Japanese/Korean) input methods.
   - **Workaround**: Settings dropdown offers `Ctrl+Shift+Space`, `Ctrl+Alt+;`, etc.

3. **VAD Tuning**: 1.5s silence timeout + RMS threshold are fine-tuned. Over-tuning breaks recordings.
   - **Before changing**: Test with 10+ varied recordings in quiet/noisy rooms.

4. **Text Injection in Secure Apps**: Password managers, admin prompts block Windows clipboard APIs.
   - **Workaround**: Text stays in clipboard; user pastes manually.

5. **Stripe Webhook**: Payment webhook must be verified in Stripe dashboard.
   - **Setup**: Add webhook URL to Stripe, copy signing secret to `wrangler.toml` `STRIPE_SIGNING_KEY`.

6. **Electron Auto-Update**: Uses GitHub Releases. Ensure `releases` repo exists and has signed builds.
   - **On Build**: `electron-builder` auto-creates GitHub release (requires `GH_TOKEN`).

## Development Workflow

1. **Modify code** → `npm start` auto-reloads renderer, may need full restart for main process changes
2. **Test hotkeys** → Run full dev build (hotkeys don't work in dev tools without full app)
3. **Package** → `npm run build` (requires valid signing cert for NSIS installer)
4. **Test portable** → `npm run build:portable` (for distributing standalone .exe)

## Common Tasks

- **Add new setting**: Define in `src/settings.js` schema, update UI in `renderer/app.js`, add toggle/input in HTML
- **Add new hotkey**: Map in `src/hotkey.js`, add override in settings, test in dev
- **Add new output mode**: Add button in `renderer/app.js`, pass mode to backend `/clean` endpoint
- **Fix text injection**: Debug with Process Monitor (procmon) to see PowerShell calls

## References

- **Full Architecture**: [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md)
- **README**: [README.md](../README.md) (features, quick start, pricing)
- **API Docs**: Check `backend/cloudflare-worker/src/index.js` for endpoint contracts
- **Electron Docs**: [electronjs.org/docs](https://www.electronjs.org/docs)
- **Web Audio API**: [MDN Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Ask questions or suggest edits**: If you find gaps, conventions that are unclear, or gotchas you discover, this file can be updated.
