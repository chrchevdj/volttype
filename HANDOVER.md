# VoltType — Handover Document

**Last Updated:** 2026-04-09
**Status:** Windows beta launched. Desktop app, website, API, and Stripe billing fully working. Android app ~40% scaffolded. Marketing launch in progress.
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

## What Was Done This Session (2026-04-09)

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

### Website Improvements
- **8-language translation system** — language selector switches hero, nav, section titles, CTAs between EN/RO/DA/DE/FR/ES/EL/MK. Saved to localStorage.
- **Animated demo** — CSS/JS demo simulating dictation → AI rewrite → Word Bank → stats (auto-plays on scroll, 35 seconds, loops)
- **3 SEO landing pages** live: ai-voice-typing-windows.html, ai-notes-from-voice.html, speech-to-text-for-windows.html (all cross-linked)
- **3 testimonials** added (Djoko/MyClienta, Lily/BrandPulso, Christina/JOBALARM)
- **Bottom nav on mobile** — replaced hamburger menu with fixed bottom tab bar (Features, Reviews, Pricing, Download, Sign Up)
- **Mobile responsiveness** — 3 breakpoints (900px tablet, 768px mobile, 380px small phone), all grids single-column on mobile
- **Dark mode fixed** — deep purple/navy palette (#0c0a1f base), all hardcoded colors replaced with CSS variables, consistent throughout
- **Footer cleaned** — "Automation tool built by MyClienta for people who hate repetitive work"
- **New icon** — lightning bolt + voice waves (purple/blue gradient on dark bg)
- **Sitemap submitted** to Google Search Console (3 pages discovered, status: Success)
- **Competitor references cleaned** from all public-facing files

### Google Search Console
- Verified and active for https://volttype.com
- Sitemap submitted: /sitemap.xml (Success, 3 pages discovered)
- 1 page indexed, 2 pending (new SEO pages)

### Scorecard Updated
- D1 database at scorecard.myclienta.com updated to A/96
- Local SCORECARD.html also updated
- Security items: CORS fix, XSS fix, webhook secret all marked as done
- Activity log entry added

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

## Android App Status

### Already Built (~40%)
- Auth: Supabase login/signup with token refresh (WORKING)
- Voice recording: expo-av capture + upload to Worker (WORKING)
- Transcription: calls /v1/transcribe (WORKING)
- LLM cleanup: calls /v1/clean (WORKING)
- Usage tracking: calls /v1/usage (WORKING)
- Copy/Share: clipboard + share sheet (WORKING)
- Settings: language + output style in AsyncStorage (WORKING)
- 3 screens: Login, Home (mic button + results), Settings

### Missing for Play Store (Phase 1 MVP)
- AI voice commands (15 commands — endpoint exists, just wire it)
- Local history (last 100 entries in AsyncStorage)
- Onboarding flow (2-step welcome)
- Upgrade/pricing UI (open Stripe Checkout in browser)
- Recording waveform animation
- Bottom tab navigation (Home, History, Settings)
- App icon + splash screen
- EAS build → AAB for Play Store

### Phase 2 (Feature Parity)
- Word Bank / Dictionary CRUD
- Templates / Snippets
- Vocab learner (port 367 lines of learning logic)
- History editing with correction learning
- Google OAuth
- Notebook/scratchpad

### Phase 3 (Mobile-Only)
- Custom keyboard (IME) — VoltType as Android keyboard with mic button (killer feature)
- Home screen widget
- Floating recording bubble
- Share sheet receiver
- Offline recording queue

### The Hard Problem: "Type in Any App"
Desktop uses clipboard + SendKeys to inject text. On Android:
- Phase 1: Copy to clipboard + toast "Paste anywhere"
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
