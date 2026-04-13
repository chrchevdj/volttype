# VoltType — Handover Document

**Last Updated:** 2026-04-14
**Status:** Windows beta launched and feature-complete. Website deployed. Android APK building on EAS. Marketing launch ready.
**Scorecard:** A (96/100) at https://scorecard.myclienta.com

## Project Overview
- **Name:** VoltType
- **Website:** https://volttype.com
- **What it does:** Voice-first AI workspace for Windows. Speak into your microphone, type into any app, rewrite with AI commands, and turn rough speech into cleaner notes and follow-ups.
- **Tech Stack:**
  - Electron (desktop app, Windows builds working)
  - HTML/CSS/JS landing page (Cloudflare Pages)
  - Expo/React Native (Android app, ~40% done)
  - Supabase auth + database (ceuymixybyaxpldgggin)
  - Cloudflare Workers API (volttype-api.crcaway.workers.dev)
- **GitHub:** chrchevdj/volttype (private)
- **Releases:** chrchevdj/volttype-releases (public, hosts .exe)

## What Was Done — Session 2026-04-14

### Desktop App — New Features
- **AI Notes Workspace** — full feature replacing plain textarea. 5 AI actions: Summarize, Action Items, Follow-ups, Meeting Notes, Email Draft. Output panel with Copy, Paste to App, Save as Template
- **Templates integration** — "Save as Template" button in AI Notes saves output to Snippets system
- **Corrections Learning fix** — word-diff bug where punctuation prevented learning (e.g. "Brent Puso." → "BrandPulso" now works)
- **Password toggle** on auth screen (eye icon show/hide)
- **Auth flow fix** — existing users who try to sign up are auto-redirected to login

### Website Fixes
- **11 hardcoded gray borders removed** — all `rgba(128,128,128,...)` replaced with `var(--border-subtle)`
- **Deployed to Cloudflare Pages** — live at volttype.com

### Testing & CI Pipeline (NEW)
- **ESLint** — flat config with 5 environments (Node, browser, service worker, Cloudflare Worker, tests)
- **Pre-push hook** — blocks push if ESLint, Vitest, or Playwright fails
- **`npm run ci`** — runs lint → unit tests → integration tests → UI tests
- **28 tests passing** across 9 test files (unit + integration)
- **0 ESLint errors**

### Android App — Production Polish
- **HistoryScreen** (new) — transcription history with copy/delete, timestamps, language badges
- **Bottom tab navigation** — Home, History, Settings (was stack-only)
- **Offline detection** — banner when no internet
- **Voice commands info card** on HomeScreen
- **Remaining time display** — prominent daily minutes counter
- **History auto-saves** to AsyncStorage after each transcription
- **Version 1.1.0**
- **APK building on EAS** — build ID: c6a12f26-8955-4242-be18-eef3bacbe5a3

### Auto-Correction Popup (Inline Learning)
- **Correction popup** — after each dictation, a floating panel shows the injected text
- If text is correct → auto-closes in 8 seconds (or press Escape)
- If text is wrong → edit it, click "Fix & Learn" → VoltType learns the correction AND replaces the text in the target app
- Uses `replaceAndInject()` — selects the old text via Shift+Left, pastes corrected text
- No more going to Dashboard to edit history entries — corrections happen inline

### Commits This Session
- `ee2f065` — password toggle, seamless auth flow, remove gray borders, add test suite
- `5033026` — ESLint, pre-push hook, npm run ci pipeline
- `8ae9ba7` — AI Notes Workspace, corrections fix, templates integration
- `aeb947b` — Android: history screen, bottom tabs, offline detection, production polish
- `c20af5a` — HANDOVER update with progress and pending tasks
- `1b7b690` — Auto-correction popup for inline learning

## What Was Done — Session 2026-04-09

### Security Fixes Applied
- **CORS lockdown** — replaced `startsWith` origin check with exact-match `Set.has()`, proper localhost parsing, 403 for unauthorized preflights
- **Webhook idempotency** — `volttype_webhook_events` table created in Supabase, duplicate Stripe events skipped
- **Webhook timestamp validation** — rejects events older than 5 minutes (replay protection)
- **Admin XSS fix** — replaced `innerHTML` with `textContent` in admin dashboard user table
- **Checkout fix** — `customer_update` params only sent when existing Stripe customer exists (was breaking for new customers)
- **Admin email** — moved from hardcoded string to `env.ADMIN_EMAIL` in wrangler.toml

### Stripe Billing (Fully Wired)
- Stripe webhook endpoint registered at `https://volttype-api.crcaway.workers.dev/v1/webhooks/stripe`
- `STRIPE_WEBHOOK_SECRET` set in Cloudflare Worker (whsec_MR6or...)
- Handles: checkout.session.completed, subscription.created/updated/deleted, invoice.paid, invoice.payment_failed
- Plan sync: active subscription → profile plan update, canceled → free
- Fallback logic: if price ID unmapped but subscription active, preserves existing paid plan

### Website (done 2026-04-09)
- 8-language i18n, animated demo, 3 SEO pages, 3 testimonials, mobile bottom nav, dark mode, new icon, sitemap in Search Console

### Scorecard
- A/96 at scorecard.myclienta.com

## Marketing Launch Plan (IN PROGRESS)

### Ready to Submit
1. **Product Hunt** — draft started at producthunt.com/posts/new/submission
   - Name: VoltType
   - Tagline: Voice typing + AI rewrite for Windows — works in any app
   - Complete onboarding first, then submit Tuesday/Wednesday/Thursday at 12:01 AM PT
2. **Website Launches** — listing detected, claim email received, claim it (free backlink)
3. **BetaList** — submit at betalist.com/submit
4. **SaaSHub** — submit at saashub.com/submit (list as Dragon/Wispr alternative)
5. **AlternativeTo** — add as alternative to Dragon NaturallySpeaking

### Reddit Posts (space 1 per day)
- r/SideProject — "I built a voice typing app for Windows..."
- r/productivity — "Voice typing changed how I write emails..."
- r/Windows11 — "Made a voice typing app that works in any Windows app..."
- r/artificial — "Built an AI voice workspace..."

### Later
- Hacker News (after getting user feedback from Reddit/PH)
- X/Twitter post with #buildinpublic

## What Needs To Be Done

### ANDROID — Before Play Store Release
- [ ] Test the APK (building now — check EAS link above)
- [ ] AI voice commands UI (15 commands — endpoint exists, wire buttons)
- [ ] Onboarding flow (2-step welcome screens)
- [ ] Upgrade/pricing UI (open Stripe Checkout in browser when limit hit)
- [ ] Recording waveform animation
- [ ] App icon + splash screen polish
- [ ] EAS build config: change buildType from "apk" to "app-bundle" (AAB for Play Store)
- [ ] Play Store listing: feature graphic (1024x500) + 4-8 screenshots + description
- [ ] Google Play Console: $25 one-time fee, submit AAB, content rating: Everyone

### ANDROID — Phase 2 (Feature Parity with Desktop)
- [ ] Word Bank / Dictionary CRUD screen
- [ ] Templates / Snippets screen
- [ ] Vocab learner (port 367 lines of learning logic)
- [ ] History editing with correction learning
- [ ] Google OAuth login
- [ ] AI Notes workspace on mobile

### ANDROID — Phase 3 (Mobile-Only Features)
- [ ] Custom keyboard (IME) — VoltType as Android keyboard with mic button (killer feature)
- [ ] Home screen widget
- [ ] Floating recording bubble
- [ ] Share sheet receiver
- [ ] Offline recording queue

### DESKTOP
- [ ] Taskbar icon — new icon-new.svg exists, needs to replace build/icon.*, rebuild .exe
- [ ] Auto-updater testing (GitHub Releases at volttype-releases repo)

### WEBSITE
- [x] Deployed 2026-04-14 with all fixes
- [ ] Google Search Console — check indexing progress (1 indexed, 2 pending)

### MARKETING (Ready to Launch)
- [ ] **Product Hunt** — submit Tue/Wed/Thu at 12:01 AM PT. Tagline: "Voice typing + AI rewrite for Windows — works in any app"
- [ ] **BetaList** — submit at betalist.com/submit
- [ ] **SaaSHub** — submit at saashub.com/submit (list as Dragon/Wispr alternative)
- [ ] **AlternativeTo** — add as alternative to Dragon NaturallySpeaking
- [ ] **Website Launches** — claim listing (email received)
- [ ] **Reddit** (1 post per day, space them out):
  - r/SideProject — "I built a voice typing app for Windows..."
  - r/productivity — "Voice typing changed how I write emails..."
  - r/Windows11 — "Made a voice typing app that works in any Windows app..."
  - r/artificial — "Built an AI voice workspace..."
- [ ] **Hacker News** — after Reddit/PH feedback
- [ ] **X/Twitter** — #buildinpublic posts
- [ ] **Demo video** — screen recording of VoltType in action (90-sec, use Win+G or OBS, edit in CapCut)

## Android App Status

### Built & Working (~70%)
- Auth: Supabase login/signup with token refresh (WORKING)
- Voice recording: expo-av capture + upload to Worker (WORKING)
- Transcription: calls /v1/transcribe (WORKING)
- LLM cleanup: calls /v1/clean (WORKING)
- Usage tracking: calls /v1/usage (WORKING)
- Copy/Share: clipboard + share sheet (WORKING)
- Settings: language + output style in AsyncStorage (WORKING)
- History: last 200 entries in AsyncStorage with copy/delete (WORKING)
- Bottom tab navigation: Home, History, Settings (WORKING)
- Offline detection with banner (WORKING)
- Voice commands info card (WORKING)
- 4 screens: Login, Home, History, Settings
- Version: 1.1.0
- APK build: c6a12f26-8955-4242-be18-eef3bacbe5a3

### The Hard Problem: "Type in Any App"
Desktop uses clipboard + SendKeys to inject text. On Android:
- Phase 1: Copy to clipboard + toast "Paste anywhere" (DONE)
- Phase 2: Share sheet to other apps
- Phase 3: Custom keyboard (IME) with mic button = true mobile equivalent

### Play Store Requirements
- Google Play Console ($25 one-time fee)
- Change eas.json buildType from "apk" to "app-bundle" (AAB required)
- Privacy policy: volttype.com/privacy-policy.html (already exists)
- Content rating: Everyone
- Need feature graphic (1024x500) + 4-8 screenshots

## Project Structure
```
VoltType/
├── main.js                      ← Electron main process
├── preload.js                   ← Electron preload script
├── src/                         ← Core app modules
│   ├── auth.js                  ← Supabase auth
│   ├── hotkey.js                ← Global hotkey handler (uiohook-napi)
│   ├── stt-groq.js              ← Speech-to-text via Groq Whisper
│   ├── text-cleaner.js          ← LLM cleanup + 15 AI voice commands
│   ├── vocab-learner.js         ← Learns from corrections (367 lines)
│   ├── history.js               ← Last 200 transcriptions
│   ├── dictionary.js            ← Word Bank / custom corrections
│   ├── snippets.js              ← Text templates
│   ├── settings.js              ← Settings manager (schema v3)
│   ├── startup.js               ← Windows auto-start
│   ├── injector.js              ← Text injection into focused app (Windows)
│   ├── icons.js                 ← Tray icon generation
│   └── png-utils.js             ← PNG helper
├── renderer/                    ← Electron renderer (app UI)
│   ├── index.html               ← 5-page UI (Dashboard, Word Bank, Templates, Notebook, Settings)
│   ├── app.js                   ← UI logic
│   └── audio.js                 ← Microphone recording + VAD
├── website/                     ← Landing page (volttype.com)
│   ├── index.html               ← Main page (i18n, dark mode, animated demo, testimonials, bottom nav)
│   ├── admin.html               ← Admin dashboard (auth-gated)
│   ├── ai-voice-typing-windows.html  ← SEO page
│   ├── ai-notes-from-voice.html      ← SEO page
│   ├── speech-to-text-for-windows.html ← SEO page
│   ├── privacy-policy.html
│   ├── terms-of-service.html
│   ├── sitemap.xml              ← 6 URLs
│   ├── manifest.json            ← PWA
│   ├── sw.js                    ← Service worker
│   └── icons/                   ← PWA icons
├── backend/cloudflare-worker/   ← API worker
│   ├── wrangler.toml            ← Config + ADMIN_EMAIL
│   ├── stripe-webhook-events.sql ← DB migration for idempotency table
│   └── src/
│       ├── index.js             ← Router: transcribe, clean, command, usage, checkout, webhooks, admin
│       ├── auth.js              ← Token verification via Supabase
│       ├── cors.js              ← Exact-match CORS (Set-based)
│       ├── groq-proxy.js        ← Proxies to Groq Whisper + LLM
│       └── usage.js             ← Usage tracking via Supabase RPC
├── android/                     ← Android app (Expo SDK 54, React Native)
│   ├── App.js                   ← Navigation root
│   ├── app.json                 ← Expo config (com.volttype.app)
│   ├── eas.json                 ← EAS build profiles
│   └── src/
│       ├── screens/             ← LoginScreen, HomeScreen, SettingsScreen
│       └── services/            ← auth.js, api.js
├── dist/                        ← Built Windows .exe
├── build/                       ← App icons (icon.svg, icon.png, icon.ico)
└── .github/workflows/build.yml  ← CI: builds Windows + macOS on push
```

## API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/health` | GET | No | Health check |
| `/v1/transcribe` | POST | JWT | Proxy audio to Groq Whisper, log usage |
| `/v1/clean` | POST | JWT | LLM text cleanup (punctuated/cleaned) |
| `/v1/command` | POST | JWT | AI voice commands (formal, translate, summarize, etc.) |
| `/v1/usage` | GET | JWT | User's plan + daily usage stats |
| `/v1/checkout` | POST | JWT | Create Stripe Checkout session |
| `/v1/webhooks/stripe` | POST | Stripe sig | Stripe webhook lifecycle handler |
| `/v1/admin/stats` | GET | JWT+admin | Admin dashboard stats |

## Cloudflare Worker Secrets (all set)
- `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`

## Supabase Tables
- `volttype_profiles` — id, email, plan, stripe_customer_id
- `volttype_usage` — daily usage tracking
- `volttype_subscriptions` — Stripe subscription records
- `volttype_webhook_events` — processed event IDs (idempotency)
- RPC: `volttype_get_plan`, `volttype_get_daily_usage`, `volttype_log_usage`

## Deployment Commands
```bash
# Website
npx wrangler pages deploy website/ --project-name volttype

# API Worker
cd backend/cloudflare-worker && npx wrangler deploy

# Desktop App
npm run build  # Creates dist/VoltType*.exe

# Android
cd android && npx eas build --platform android --profile production
```

## Key URLs
- Website: https://volttype.com
- API: https://volttype-api.crcaway.workers.dev
- Scorecard: https://scorecard.myclienta.com
- Supabase: ceuymixybyaxpldgggin.supabase.co
- Stripe Webhook: https://volttype-api.crcaway.workers.dev/v1/webhooks/stripe
- Google Search Console: verified, sitemap submitted
- All credentials: `.env.master` at `C:\Users\crcaw\Desktop\Freelancing\.env.master`
