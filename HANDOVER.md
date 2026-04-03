# VoltType — Handover Document

**Last Updated:** 2026-04-01  
**Status:** Landing page live, desktop app in development, auth needs fixing

## Project Overview
- **Name:** VoltType
- **Website:** https://volttype.com
- **What it does:** AI-powered desktop dictation app. Speak into your microphone, VoltType transcribes in real-time with AI enhancement.
- **Tech Stack:** 
  - Electron (desktop app, Windows builds working)
  - HTML/CSS/JS landing page
  - Supabase auth (ceuymixybyaxpldgggin)
  - Cloudflare Workers API (volttype-api.crcaway.workers.dev)
  - Cloudflare Pages hosting
- **GitHub:** chrchevdj/volttype (private)
- **Current Status:** Landing page deployed, auth flow broken, needs SEO and visuals

## Project Structure
```
Speaker Project/
├── main.js                      ← Electron main process
├── preload.js                   ← Electron preload script
├── start.js                     ← Start script
├── package.json                 ← Dependencies (electron, electron-builder)
├── dist/                        ← Built Electron app (Windows .exe files)
├── src/                         ← Core app modules
│   ├── auth.js                  ← Supabase auth logic (BROKEN)
│   ├── hotkey.js                ← Global hotkey handler
│   ├── stt-groq.js              ← Speech-to-text via Groq API
│   ├── text-cleaner.js          ← Post-processing logic
│   ├── history.js               ← Transcript history storage
│   └── [other modules]
├── renderer/                    ← Electron renderer (app UI)
│   ├── index.html
│   ├── app.js
│   ├── audio.js                 ← Microphone recording
│   └── styles.css
├── website/                     ← Landing page (DEPLOYED)
│   ├── index.html               ← Main landing page
│   ├── privacy-policy.html
│   ├── terms-of-service.html
│   ├── sitemap.xml
│   └── robots.txt
├── pwa/                         ← PWA assets
│   ├── manifest.json
│   ├── icon-192.png
│   └── icon-512.png
├── backend/
│   └── cloudflare-worker/       ← API worker
│       ├── wrangler.toml
│       └── src/
├── android/                     ← Android/React Native version (separate app)
├── HANDOVER.md                  ← This file
└── AUDIT-REPORT.md              ← Full audit findings
```

## Current State (2026-04-03) — SALE-READY CHECKLIST

### ✅ Fully Working (ready)
1. **Auth flow** — Supabase email/password login + signup working. Profile upsert after signup. ✅
2. **Dictation** — Hold Ctrl+Space, speak, release → Groq Whisper transcribes, injects text. ✅
3. **Settings** — Groq API key, language, hotkey dropdown, output style, start minimized, autostart. ✅
4. **Word Bank / Dictionary** — Custom corrections applied post-transcription. ✅
5. **Templates / Snippets** — Save and inject text blocks with hotkey. ✅
6. **Notebook** — Scratchpad for testing dictation. ✅
7. **History** — Last 200 sessions with edit/delete. ✅
8. **Vocab Learning** — App learns from corrections, improves Whisper prompts. ✅
9. **First-run onboarding** — 3-step welcome modal (localStorage gated). ✅
10. **Usage stats** — Words typed by voice, minutes saved, total sessions. ✅
11. **Pricing** — Free (10 min/day), Basic $4.99/mo (30 min/day), Pro $8.99/mo (unlimited). ✅
12. **Installer** — VoltType.Setup.1.0.0.exe on GitHub releases. ✅
13. **Auto-update** — electron-updater checks GitHub releases, downloads silently, shows update banner. ✅
14. **Hotkey config** — Ctrl+Shift+D (default), Ctrl+Alt+D, F9, F10 via dropdown. ✅
15. **Language selector** — EN, RO, DA, MK, EL, DE, FR, ES in settings. ✅
16. **Mobile hamburger** — Website responsive, hamburger menu on mobile. ✅
17. **Favicon** — Set on both website and app. ✅
18. **Dark mode** — Website toggle (☀️/🌙) saves to localStorage. ✅
19. **Stripe checkout** — Worker code complete, reads STRIPE_SECRET_KEY + STRIPE_PRICE_BASIC/PRO from env. ✅ (needs price IDs set)
20. **Tray icon** — Stays in Windows tray, minimize to tray on close. ✅

### ⚠️ Needs Manual Steps Before Launching
- **Stripe prices** — Create VoltType Basic + Pro products in Stripe, then run:
  ```
  wrangler secret put STRIPE_SECRET_KEY
  wrangler secret put STRIPE_PRICE_BASIC  (paste price_xxx)
  wrangler secret put STRIPE_PRICE_PRO    (paste price_xxx)
  ```
- **Demo GIF/video** — Screen record dictation in action, add to website hero section

### ❌ Not Needed for Sale (documented for future)
- Demo video (#4) — can ship without, add as enhancement
- Stripe activation (#6) — needs real Stripe price IDs

## Key Files & Credentials

### Landing Page (website/)
- **File:** website/index.html
- **Deployment:** Cloudflare Pages → volttype.com
- **Build:** Static HTML (no build step needed)
- **Deploy Command:** Manual push to GitHub or direct to Cloudflare

### Desktop App (Electron)
- **Entry:** main.js (Electron main process)
- **Renderer:** renderer/index.html (app UI)
- **Build:** `npm run build` → creates dist/VoltType*.exe
- **Auth Module:** src/auth.js (BROKEN — needs fix)

### Backend API
- **URL:** https://volttype-api.crcaway.workers.dev
- **Location:** backend/cloudflare-worker/
- **Type:** Cloudflare Worker (serverless)
- **Deploy:** `npx wrangler deploy`

### Auth & Database
- **Provider:** Supabase
- **Project ID:** ceuymixybyaxpldgggin
- **Auth Type:** Email/password with email confirmation
- **Status:** Login flow not working — likely email confirmation or API connectivity issue

### Credentials
- All credentials in `.env.master` at `/Desktop/Freelancing/.env.master`
- Sync with: `node sync-env.js` from project root
- **Never commit .env files to Git**

## What Needs to Happen Next (Priority)

### Critical (Blocks everything)
1. **Fix auth flow** — Debug why Supabase login doesn't work
   - Check email confirmation flow
   - Verify API endpoint connectivity
   - Test auth.js with real credentials
2. **Add SEO** — Title, meta description, OG tags, JSON-LD
3. **Add app screenshots** — 3-4 images showing VoltType in action
4. **Fix navigation anchors** — Ensure #features, #pricing, #download work

### High Priority
5. **Create privacy/terms pages** — Real HTML pages (not links to nothing)
6. **Add security headers** — CSP, X-Frame-Options, X-Content-Type-Options, HSTS
7. **Replace emoji icons** — Use Lucide React icons instead of ⚡🧠✎
8. **Add favicon** — favicon.ico + apple-touch-icon

### Nice to Have
9. **Add social links** — GitHub, Twitter/X in footer
10. **Create demo video** — Show dictation in action (GIF or MP4)
11. **Mobile app roadmap** — Document Android/iOS plans

## Deployment Checklist

### Landing Page (volttype.com)
```bash
# 1. Make changes to website/ folder
# 2. Commit to Git
git add website/
git commit -m "Update landing page: add SEO, screenshots, etc"
git push

# 3. Cloudflare Pages auto-deploys from GitHub
# Check deployment at: https://dash.cloudflare.com/
```

### Desktop App
```bash
# 1. Fix code in src/, renderer/, main.js, etc
# 2. Build locally
npm run build

# 3. Test .exe in dist/
dist/VoltType\ Setup\ 1.0.0.exe

# 4. Commit and push
git add .
git commit -m "Fix auth flow and improve security"
git push

# 5. Create GitHub release with dist/*.exe files
```

### Backend API (Cloudflare Worker)
```bash
cd backend/cloudflare-worker/
npx wrangler deploy
```

## Known Issues & Notes

1. **Email Confirmation Flow** — Users may not be getting confirmation emails. Check Supabase email settings.
2. **API Connectivity** — volttype-api.crcaway.workers.dev may have CORS issues. Add proper CORS headers.
3. **Exposed Infrastructure** — API endpoint URL is public. Consider hiding behind Cloudflare tunnel if sensitive.
4. **Android Version** — Separate React Native app in android/ folder. Not yet integrated with main desktop app.
5. **GitHub Workflows** — .github/workflows/build.yml exists but may need updating for production builds.

## Audit & Next Steps

See **AUDIT-REPORT.md** for full audit findings. Current grade: **C+**

To reach B grade (~7 hours of work):
1. Fix auth (1-2 hours)
2. Add SEO + OG tags (30 min)
3. Add screenshots + demo (1-2 hours)
4. Fix navigation + security (1 hour)
5. Polish UI (icons, favicon, links) (1-2 hours)

## Resources

- **Landing Page:** https://volttype.com
- **GitHub:** https://github.com/chrchevdj/volttype
- **Supabase Dashboard:** https://supabase.com/dashboard
- **Cloudflare Dashboard:** https://dash.cloudflare.com/
- **n8n (if automations needed):** https://ideaforge.jobalarm.dk
- **Hetzner VPS:** 46.225.221.32 (shared infrastructure)

## Next Session Checklist
- [ ] Read this HANDOVER.md and AUDIT-REPORT.md
- [ ] Test login flow — does auth actually work?
- [ ] Check Supabase email settings — why no confirmation emails?
- [ ] Review website/index.html — what SEO tags are missing?
- [ ] Take 3-4 screenshots of VoltType app in action
- [ ] Plan sprint: fix auth, add SEO, add visuals
