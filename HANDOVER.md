# VoltType — HANDOVER

## What It Is
**VoltType** — AI-powered voice typing desktop app that learns your style. Local-first, no subscription, no cloud accounts.

Hold Ctrl+Space, speak, release — text appears in any app. Learns your vocabulary and corrections over time.

## Tech Stack
- **Framework:** Electron 35 (desktop shell)
- **STT Engine:** Groq STT API (free tier, large-v3-turbo)
- **Text Processing:** Groq LLM (Llama 3.3 70B) for optional punctuation/grammar
- **Audio:** Web Audio API + MediaRecorder + VAD (Voice Activity Detection)
- **Text Injection:** PowerShell + Windows API (SetForegroundWindow + clipboard paste)
- **Global Hotkey:** uiohook-napi (Ctrl+Space hold-to-talk)
- **UI:** Vanilla HTML/CSS/JS, glassmorphism bright theme
- **Storage:** JSON files in `%APPDATA%/volttype/`
- **Learning:** Personal vocabulary learner with correction tracking

## Live URL
N/A — Desktop app only (Electron)

## GitHub Repo
`chrchevdj/volttype` (private)

## Key Files
| File | Purpose |
|------|---------|
| `main.js` | Electron main process — app shell, IPC, tray, hotkeys, recording flow |
| `preload.js` | IPC bridge (contextBridge) between main and renderer |
| `start.js` | Launcher with auto-restart on crash (up to 5 retries) |
| `src/hotkey.js` | Ctrl+Space hold-to-talk via uIOhook-napi with debounce |
| `src/stt-groq.js` | Groq STT API — transcription with prompt context |
| `src/text-cleaner.js` | LLM post-processor (punctuation/grammar modes) |
| `src/vocab-learner.js` | Personal vocabulary + correction learning system |
| `src/injector.js` | Text injection into focused Windows apps |
| `src/settings.js` | Settings persistence with schema migration |
| `src/dictionary.js` | Word replacement rules (Word Bank) |
| `src/snippets.js` | Saved text blocks (Templates) |
| `src/history.js` | Session history with edit/correction support |
| `src/icons.js` | Runtime tray icon generation (purple brand) |
| `src/png-utils.js` | Minimal PNG encoder (zero deps) |
| `src/startup.js` | Windows auto-start (registry) |
| `renderer/index.html` | Main UI — glassmorphism design |
| `renderer/styles.css` | Premium bright theme with gradients |
| `renderer/app.js` | UI logic, recording flow, sound feedback, vocab UI |
| `renderer/audio.js` | Audio capture with VAD + mic pre-warming |

## How to Run
```bash
npm install
npm start        # Normal launch
npm run dev      # With DevTools
npm run build    # Package for Windows
```

## Hotkeys
| Hotkey | Mode | Behavior |
|--------|------|----------|
| **Hold Ctrl+Space** | Hold-to-talk | Records while held, stops on release. VAD OFF — you control timing. |
| **Ctrl+Shift+D** | Toggle | Press to start, auto-stops on 1.5s silence (VAD ON). Press again to manual stop. |

## Navigation (Sidebar)
| Page | Purpose |
|------|---------|
| Dashboard | Status cards, learning progress, session history |
| Word Bank | Custom word replacement rules |
| Templates | Saved reusable text blocks |
| Notebook | Test area for voice typing |
| Settings | Engine, hotkeys, output mode, mic, privacy |

## Features
- Hold-to-talk (Ctrl+Space) with live waveform visualization
- Toggle mode (Ctrl+Shift+D) with VAD auto-stop on silence
- 3 output modes: Your Words + Punctuation (default), AI Rewrite, 100% Raw
- Personal vocabulary learner — learns from every session
- Correction learning — edit history items, app learns your fixes
- Duplicate sentence detection (prevents STT repetition bugs)
- Mic pre-warming for instant start, crash auto-restart watchdog
- System tray with purple brand icon, floating recording overlay
- Sound feedback (beeps on start/stop/success/error)

## Architecture
- Audio start/stop serialized via promise queue (prevents race conditions)
- MediaRecorder waits for `onstart` event before resolving
- Main process: 500ms toggle debounce, 400ms hold-to-talk debounce
- Minimum recording: 600ms (shorter = discarded)
- STT prompt built from learned vocab + corrections (no recent history — prevents repetition)
- Settings schema versioned (v3) with auto-migration
- Launcher auto-restarts on crash (up to 5 times, resets after 30s stable)

## Known Limitations
- Text injection fails in elevated (admin) windows
- Chrome/browser can steal mic exclusive access (app retries)
- Local offline engine not implemented yet
- No auto-update mechanism

## Cost
$0 — Groq free tier (STT + LLM), no subscriptions, fully local storage.
