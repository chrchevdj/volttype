# VoltType Competitive Analysis — April 2026

## Current VoltType Pricing
- **Free**: 10 min/day
- **Basic**: $4.99/mo (30 min/day)
- **Pro**: $8.99/mo (unlimited)
- No annual plan, no team plan

## Competitor Pricing Snapshot

| Tool | Free | Paid Monthly | Annual | Notes |
|------|------|--------------|--------|-------|
| **Wispr Flow** | 2,000 words/week | $15/mo | $12/mo ($144/yr, 20% off) | Teams $10/user/yr min 3 seats; Student 50% off; Accessibility/nonprofit/military/senior discounts |
| **Superwhisper** | Local models unlimited | $9.99/mo | $84.99/yr (29% off) | Lifetime $249 |
| **Otter.ai** | 300 min/mo | $16.99/mo | $8.33/mo annual | Business $30/user (meeting bot, shared dict) |
| **Speechify** | Voice typing free | $29/mo | $139/yr ($11.58/mo) | Chrome extension is killer channel |
| **Plaud** | Hardware required | $99.99/yr | Unlimited $239/yr | Needs $159+ device |
| **Dragon Anywhere (mobile)** | 7-day trial | $15/mo | $150/yr | Windows desktop: $699 one-time |
| **MacWhisper** | Basic models | $30 one-time | — | macOS only |
| **VoiceInk** | Open-source | $39.99 one-time | — | Dev-focused |
| **Aiko** | FREE FOREVER | — | — | 100% local, Mac/iOS, Whisper Large V3 |
| **DictoKey** (Android) | Limited | ~$5-7/mo | Annual discount | Android IME keyboard |
| **Gboard** | FREE | — | — | Built into Android |

## What Wispr Flow ($12/mo) actually gives you

- **Unlimited dictation** (vs 2k words/week free)
- **Command Mode** — highlight text, speak an instruction, it rewrites
- **Context Awareness** — detects active app (Slack/Gmail/Notion), adjusts tone
- **Reads surrounding text** before dictating (Android)
- **Dictionary** (Word Bank equivalent) — syncs across all devices
- **Styles** — saved rewrite modes (formal, concise, etc.)
- **Snippets** — text expansion
- **Wake word** "Hey Flow"
- **100+ languages**
- **Privacy Mode** (zero data retention)
- **Cross-device sync** — Win/Mac/iOS/Android
- **Floating bubble** on Android (overlays all apps)

## VoltType vs Competitors — Key Gaps

### WE HAVE, THEY DON'T
1. **AI Notes Workspace** — curated Summarize/Action Items/Follow-ups/Meeting Notes/Email Draft workflow. Nobody else bundles this.
2. **Correction Popup** (auto-learn from edits) — unique UX
3. **Offline recording + online AI cleanup** — Wispr is cloud-only; Superwhisper is local-only; we're hybrid
4. **Separate Word Bank + Vocab Learner** — cleaner mental model than Wispr's single Dictionary
5. **$8.99 unlimited is cheaper** than Wispr $12, Otter $16.99, Dragon $15

### THEY HAVE, WE DON'T (CRITICAL GAPS)

| Feature | Who has it | Impact |
|---------|-----------|--------|
| **Annual plan (20-50% off)** | Everyone except us | Losing 25-50% of potential revenue |
| **Context awareness** (auto-detects active app, tone shifts) | Wispr Flow | Their flagship 2026 feature |
| **Android system keyboard (IME)** | DictoKey, Gboard | Power users won't leave their keyboard |
| **Android floating bubble** | Wispr Flow | Works in every app without switching |
| **100+ languages** | Wispr, Speechify, Plaud, Superwhisper, Gboard | We have 8. SEO/marketing killer. |
| **Translation during dictation** | Wispr, Superwhisper, DictoKey | Speak Romanian → output English |
| **Browser extension** | Speechify | Free acquisition funnel |
| **Team plan** | Wispr, Otter | SMB revenue |
| **iOS app** | Everyone | Half the mobile market |
| **Privacy Mode (zero-retention)** | Wispr, Superwhisper | Enterprise blocker |
| **BYOK (bring your own key)** | OpenWhispr, Handy, Whispering | Trust signal |
| **Cloud sync across devices** | Wispr, Otter | Power users expect this |
| **Wake word "Hey VoltType"** | Wispr (Pro) | Nice to have |
| **Student/accessibility discounts** | Wispr | High referral rate |

## Recommended Pricing (new)

| Tier | Monthly | Annual (/mo equivalent) | Annual Total |
|------|---------|-------------------------|--------------|
| Free | 7 min/day, AI Notes 3×/day | — | — |
| Basic | $5.99/mo | $3.99/mo | $47.88/yr |
| **Pro** | **$11.99/mo** | **$8.99/mo (current)** | **$107.88/yr** |
| Teams | $14.99/user/mo | $9.99/user/mo (3 seat min) | — |
| Lifetime | — | — | **$149 one-time** (limited launch) |

Plus:
- Student 50% off (verified)
- Accessibility discount (verified)
- Nonprofit discount

## Android Feature Roadmap

### Phase 1 — Desktop Parity (MUST HAVE)
- AI Notes Workspace on Android (all 5 generators)
- Word Bank CRUD
- Templates
- Personal vocab learner
- **Correction popup on mobile** — detect text edits, offer to learn
- Expand to 100+ languages (Whisper config change, 1 line)

### Phase 2 — Android-Specific Distribution
- **System keyboard (IME)** — "VoltType Keyboard" with mic button
- **Floating bubble overlay** — like Wispr Flow
- **Share sheet** — "Share → VoltType" from any app
- **Quick-Settings tile** — pull-down nav
- **Home-screen widget**

### Phase 3 — Mobile-Only Killer Features
- **Offline-first recording** — queue for cloud processing when online (Wispr can't do this)
- **WhatsApp voice-note transcriber** — huge in Europe/LATAM/India
- **Translation during dictation** — speak in one language, output another
- **Context awareness** (auto-detect active app via Accessibility Service, shift tone)
- **Reads surrounding text** before dictating
- **Meeting recorder mode** — system audio during Zoom/Meet

### Phase 4 — Monetization
- **Annual plans in Play Store billing**
- **Lifetime deal** ($149 first 500 users)
- **In-app referral** — give friend 1 month, get 1 month
- **Accessibility discount verification flow**

### Phase 5 — Trust / Privacy
- **Privacy Mode toggle** (zero-retention)
- **Local-only mode** (whisper.cpp on-device)
- **BYOK option** (Pro tier)
- **Export + delete-all** (GDPR compliance = marketable feature)

## Monday Action Items (do first)

1. Ship annual plans — $8.99/mo → $89.99/yr. Zero engineering cost, ~25% revenue lift.
2. Raise Pro monthly to $11.99 (keep annual at $8.99/mo equivalent).
3. Expand to 100+ languages in Whisper config (one config change).
4. Fix the 4 Android bugs (signup flow, nav bar, 500 error, missing integrations).
5. Port AI Notes + Word Bank + Templates + Correction popup to Android.
6. Ship Android IME + floating bubble (2-3 week project).
7. Add translation feature (Whisper supports it natively).
8. Add student + accessibility discounts.

---

Last updated: 2026-04-14. Source: Web research across Wispr, Superwhisper, Otter, Speechify, Plaud, Dragon, Gboard, DictoKey, MacWhisper, VoiceInk, Aiko.
