# VoltType

**Voice-first AI workspace for Windows** — hold a key, speak, and turn rough speech into writing, summaries, and notes that are ready to use.

## Features

- **Hold-to-talk** — Hold `Ctrl+Space`, speak naturally, release to transcribe
- **Toggle mode** — Press `Ctrl+Shift+D` to start, auto-stops when you pause
- **Type anywhere** — Text gets pasted into whatever window is focused
- **AI notes workflows** — Turn speech into summaries, bullets, and follow-ups
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

1. Create an account on the website or in the app
2. Hold `Ctrl+Space` and speak
3. Release — text appears in the focused app

## How It Works

1. Hold `Ctrl+Space` — recording starts instantly (mic pre-warmed)
2. Speak naturally — live waveform shows audio level
3. Release — audio sent to the backend for transcription
4. Punctuation added automatically
5. Text can be pasted into the focused app or cleaned into notes
6. VoltType learns your vocabulary for better accuracy next time

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

Local app data is stored in `%APPDATA%/volttype/`:
- `settings.json` — Configuration
- `history.json` — Session history
- `dictionary.json` — Word Bank rules
- `snippets.json` — Templates
- `vocab.json` — Learned vocabulary

User accounts, subscriptions, and usage tracking are handled through Supabase and the Cloudflare Worker backend. Local vocabulary, snippets, and settings remain on-device.

## Pricing

- **Free** — 10 minutes/day
- **Basic** — $4.99/month
- **Pro** — $8.99/month

Current launch posture: **Windows beta**. Card payments are live via Stripe. ACH Direct Debit and SEPA Direct Debit are planned as optional regional methods, not the default path.

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
