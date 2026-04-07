# VoltType — Handover Document

**Last Updated:** 2026-04-07
**Status:** Windows beta launchable. Desktop app, website, and API are working, but production billing still needs live webhook verification and mobile apps are not store-ready.

## Project Overview
- **Name:** VoltType
- **Website:** https://volttype.com
- **What it does:** Voice-first AI workspace for Windows. Speak into your microphone, type into any app, rewrite with AI commands, and turn rough speech into cleaner notes and follow-ups.
- **Tech Stack:**
  - Electron (desktop app, Windows builds working)
  - HTML/CSS/JS landing page (Cloudflare Pages)
  - Expo/React Native (Android app)
  - Supabase auth + database (ceuymixybyaxpldgggin)
  - Cloudflare Workers API (volttype-api.crcaway.workers.dev)
- **GitHub:** chrchevdj/volttype (private)
- **Releases:** chrchevdj/volttype-releases (public, hosts .exe)

## Project Structure
```
VoltType/
├── main.js                      ← Electron main process
├── preload.js                   ← Electron preload script
├── start.js                     ← Start script
├── package.json                 ← Dependencies (electron, electron-builder)
├── dist/                        ← Built Electron app (Windows .exe files)
├── build/                       ← App icons (icon.png, icon.svg, icon.ico)
├── src/                         ← Core app modules
│   ├── auth.js                  ← Supabase auth (working)
│   ├── hotkey.js                ← Global hotkey handler
│   ├── stt-groq.js              ← Speech-to-text via Groq API
│   ├── text-cleaner.js          ← LLM post-processing
│   ├── vocab-learner.js         ← Learns from corrections
│   ├── history.js               ← Transcript history storage
│   ├── dictionary.js            ← Word bank / custom corrections
│   ├── snippets.js              ← Text templates
│   ├── settings.js              ← Settings manager
│   ├── startup.js               ← Auto-start on Windows boot
│   ├── injector.js              ← Text injection into focused app
│   ├── icons.js                 ← Tray icon generation
│   └── png-utils.js             ← PNG helper
├── renderer/                    ← Electron renderer (app UI)
│   ├── index.html
│   ├── app.js
│   ├── audio.js                 ← Microphone recording
│   └── styles.css
├── website/                     ← Landing page (DEPLOYED to volttype.com)
│   ├── index.html               ← Main landing page
│   ├── privacy-policy.html
│   ├── terms-of-service.html
│   ├── manifest.json            ← PWA manifest
│   ├── sw.js                    ← Service worker (volttype-v2 cache)
│   ├── og-image.png             ← OpenGraph image
│   ├── sitemap.xml
│   ├── robots.txt
│   └── icons/                   ← PWA icons (192px, 512px)
├── pwa/                         ← PWA assets (alternate)
│   ├── manifest.json
│   ├── icon-192.png
│   └── icon-512.png
├── backend/
│   └── cloudflare-worker/       ← API worker
│       ├── wrangler.toml
│       └── src/
│           ├── index.js         ← Main router (transcribe, clean, usage, checkout)
│           ├── auth.js          ← JWT verification
│           ├── cors.js          ← CORS for volttype.com + Electron
│           ├── groq-proxy.js    ← Proxies to Groq Whisper + LLM
│           └── usage.js         ← Usage tracking via Supabase RPC
├── android/                     ← Android app (Expo/React Native)
│   ├── App.js                   ← Navigation (Login → Home → Settings)
│   ├── app.json                 ← Expo config (com.volttype.app)
│   ├── package.json
│   └── src/
│       ├── screens/             ← LoginScreen, HomeScreen, SettingsScreen
│       └── services/            ← auth.js, api.js
├── .github/workflows/build.yml  ← CI: builds Windows + macOS on push
└── HANDOVER.md                  ← This file
```

## Current State (2026-04-05)

### ✅ Fully Working
1. **Auth flow** — Supabase email/password login + signup. Trigger `volttype_handle_new_user()` auto-creates profile. Website + desktop both write to `volttype_profiles`.
2. **Dictation** — Hold Ctrl+Space (hold-to-talk) or Ctrl+Shift+D (toggle). Groq Whisper transcribes, injects text into focused app.
3. **LLM cleanup** — Post-transcription grammar/punctuation cleanup via Groq LLM (llama-3.3-70b).
4. **AI Voice Commands** — Say "make formal", "fix grammar", "translate to [language]", "make shorter", "make bullet points", "summarize", "rewrite", etc. after dictating. Detected in text-cleaner.js, executed via Groq LLM, replaces last dictation in history + re-injects.
5. **Settings** — Groq API key, language (8 langs), hotkey dropdown, output style, start minimized, autostart.
6. **Word Bank / Dictionary** — Custom corrections applied post-transcription.
7. **Templates / Snippets** — Save and inject text blocks.
8. **Notebook** — Scratchpad for testing dictation.
9. **History** — Last 200 sessions with edit/delete. Edits feed into vocab learning.
10. **Vocab Learning** — App learns from corrections, improves Whisper prompts over time.
11. **First-run onboarding** — 3-step welcome modal (localStorage gated).
12. **Usage stats** — Words typed by voice, minutes saved, total sessions.
13. **Pricing plans** — Free (10 min/day), Basic $4.99/mo (30 min/day), Pro $8.99/mo (unlimited).
14. **Stripe checkout** — Worker endpoint creates Stripe Checkout sessions, stores plan metadata, and syncs subscription state through Stripe webhooks.
15. **Installer** — VoltType.Setup.1.0.0.exe on GitHub releases (chrchevdj/volttype-releases).
16. **Auto-update** — electron-updater checks GitHub releases, downloads silently, shows update banner.
17. **Hotkey config** — Ctrl+Shift+D (default), Ctrl+Alt+D, F9, F10 via dropdown.
18. **Language selector** — EN, RO, DA, MK, EL, DE, FR, ES in settings.
19. **Tray icon** — Stays in Windows tray, minimize to tray on close. Icon changes for recording/processing.
20. **Website** — SEO foundations (title, meta, OG tags, JSON-LD), dark mode toggle, mobile hamburger menu, PWA manifest + service worker, privacy policy, terms of service, AI notes positioning, search landing pages, AI command showcase, keyboard shortcuts, changelog, and builder section.
21. **GitHub Actions CI** — Builds Windows .exe + macOS .dmg on push to master.
22. **Google OAuth** — Website supports Google sign-in redirect via Supabase.
23. **PWA** — Both website/ and pwa/ have proper service workers with offline fallback pages, updated manifests with all required fields.
24. **API** — Cloudflare Worker with global error handling, request size limits, CORS for app.volttype.com, and /v1/command endpoint for AI voice commands.

### ✅ Cloudflare Worker Secrets (all set)
- `GROQ_API_KEY` — Groq API key for STT + LLM
- `SUPABASE_URL` — ceuymixybyaxpldgggin.supabase.co (set as var in wrangler.toml)
- `SUPABASE_SERVICE_KEY` — Service role key
- `SUPABASE_JWT_SECRET` — For verifying user JWTs
- `STRIPE_SECRET_KEY` — Live Stripe key
- `STRIPE_PRICE_BASIC` — Price ID for Basic plan ($4.99/mo)
- `STRIPE_PRICE_PRO` — Price ID for Pro plan ($8.99/mo)

### ✅ Supabase Database
- `volttype_profiles` — User profiles (id, email, display_name, plan, stripe_customer_id)
- `volttype_usage` — Daily usage tracking
- `volttype_subscriptions` — Stripe subscription records
- Trigger: `on_volttype_user_created` → `volttype_handle_new_user()` auto-creates profile on signup
- RPC functions: `volttype_get_plan`, `volttype_get_daily_usage`, `volttype_log_usage`
- RLS enabled on all VoltType tables

### ⚠️ In Progress
- **Production billing verification** — Register live Stripe webhooks and run a paid subscription end-to-end test.
- **Android APK** — Expo app scaffolded with auth, dictation, settings. Needs EAS build config and APK generation.

### 📋 Nice to Have (Not Blocking Launch)
- **Demo video/GIF** — Screen record dictation in action for website hero
- **macOS .dmg** — CI builds it but not tested or published

## Key Credentials & URLs
- **Website:** https://volttype.com (Cloudflare Pages, auto-deploys from GitHub)
- **API:** https://volttype-api.crcaway.workers.dev
- **Supabase:** ceuymixybyaxpldgggin (shared instance)
- **GitHub:** chrchevdj/volttype (code), chrchevdj/volttype-releases (releases)
- **All credentials:** `.env.master` at `C:\Users\crcaw\Desktop\Freelancing\.env.master`

## Deployment

### Landing Page (volttype.com)
```bash
git add website/
git commit -m "Update landing page"
git push
# Cloudflare Pages auto-deploys from GitHub
```

### Stripe / Billing
- Cards stay enabled as the default payment method for launch.
- ACH Direct Debit is the relevant future bank method for eligible US subscriptions.
- SEPA Direct Debit is the relevant future bank method for Europe, but it should only be enabled after EUR subscription prices are created in Stripe.
- Required webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

### Desktop App
```bash
npm run build                    # Creates dist/VoltType*.exe
# Then create GitHub release at chrchevdj/volttype-releases with the .exe
```

### Backend API
```bash
cd backend/cloudflare-worker/
npx wrangler deploy
```

### Android App
```bash
cd android/
npm install
npx eas build --platform android --profile production
# Download APK from EAS dashboard
```
