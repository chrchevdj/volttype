# VoltType

**AI-powered voice typing for Windows** — hold a key, speak, release. Your words appear in any app, with smart punctuation and vocabulary that learns your style.

## Features

- **Hold-to-talk** — Hold `Ctrl+Space`, speak naturally, release to transcribe
- **Toggle mode** — Press `Ctrl+Shift+D` to start, auto-stops when you pause
- **Type anywhere** — Text gets pasted into whatever window is focused
- **Learns your words** — Builds your personal vocabulary over time
- **Correction learning** — Edit a result, the app learns from your fix
- **Word Bank** — Custom word replacements (names, acronyms, punctuation)
- **Templates** — Saved text blocks for quick insertion
- **Notebook** — Built-in editor for testing voice typing
- **Live waveform** — Visual feedback while recording
- **Sound cues** — Beeps on start/stop/success
- **Free** — Uses Groq free tier STT, $0 cost

## Quick Start

```bash
npm install
npm start
```

1. Open Settings, paste your free [Groq API key](https://console.groq.com)
2. Hold `Ctrl+Space` and speak
3. Release — text appears in the focused app

## How It Works

1. Hold `Ctrl+Space` — recording starts instantly (mic pre-warmed)
2. Speak naturally — live waveform shows audio level
3. Release — audio sent to Groq STT (~400ms)
4. Punctuation added automatically
5. Text pasted into the focused app via clipboard
6. App learns your vocabulary for better accuracy next time

## Voice Input Modes

| Mode | Hotkey | Behavior |
|------|--------|----------|
| **Hold-to-talk** | `Ctrl+Space` | Records while held, stops on release |
| **Toggle** | `Ctrl+Shift+D` | Press to start, auto-stops on 1.5s silence |

## Output Modes

| Mode | Description |
|------|-------------|
| **Your Words + Punctuation** | Keeps your exact words, adds periods and commas (default) |
| **AI Rewrite** | Rewrites for grammar (may change meaning) |
| **100% Raw** | Exact STT output, nothing touched |

## Data Storage

All data stored locally in `%APPDATA%/volttype/`:
- `settings.json` — Configuration
- `history.json` — Session history
- `dictionary.json` — Word Bank rules
- `snippets.json` — Templates
- `vocab.json` — Learned vocabulary

No cloud sync, no accounts, no tracking.

## Cost

**$0** — Groq free tier. No subscriptions.

## Tech Stack

- Electron 35 (desktop framework)
- Groq STT API (speech-to-text)
- Groq LLM API (text processing)
- Web Audio API + VAD (voice activity detection)
- uiohook-napi (global hotkeys)
- Pure HTML/CSS/JS (no framework)

## Packaging

```bash
npm run build           # Windows installer + portable
npm run build:portable  # Portable only
```
