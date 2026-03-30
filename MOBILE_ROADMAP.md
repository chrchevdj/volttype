# VoltType Mobile — Development Roadmap

## Why Mobile?
The desktop app (Electron) cannot run on Android/iOS. A complete rebuild is needed using a mobile framework. This document outlines the plan.

## Recommended Framework
**React Native** (with Expo) — fastest path to both Android and iOS with shared codebase. Alternatively, Kotlin for Android-only if targeting Play Store first.

## Core Features for Mobile MVP
1. **Push-to-talk button** — large floating mic button, tap-and-hold to record
2. **Copy-to-clipboard** — transcribed text copied to clipboard (no injection into other apps on mobile)
3. **Share intent** — share transcribed text to any app (WhatsApp, Email, Notes)
4. **Supabase Auth** — same login as desktop, same backend
5. **Cloudflare Worker proxy** — same API, same usage tracking
6. **Offline indicator** — show when network unavailable
7. **Usage meter** — show remaining minutes for the day

## Architecture
```
Mobile App (React Native)
  → Supabase Auth (login/signup)
  → Cloudflare Worker (volttype-api)
    → Groq Whisper API (transcription)
    → Groq LLM (text cleanup)
  → Supabase DB (usage tracking)
```

## Google Play Requirements
- **Target API level:** Latest Android SDK (API 35+)
- **Privacy policy URL:** https://volttype.com/privacy-policy
- **Content rating:** Complete IARC questionnaire (category: Utility)
- **App signing:** Use Play App Signing (Google manages the key)
- **Permissions needed:** RECORD_AUDIO, INTERNET
- **Data safety form:** Declare: audio processed via API (not stored), usage data for billing
- **Developer account:** $25 one-time fee (Google Play Console)

## Revenue Model
- Google Play takes 15% on first $1M revenue, 30% after
- For subscriptions: 15% first year, then 30% (or 10% after 1 year with same subscriber)
- Same tiers as desktop: Free (10 min/day), Basic ($5/mo), Pro ($9/mo)
- Use Google Play Billing Library for in-app subscriptions
- Apple App Store (if iOS): 15-30% cut, similar subscription model

## Timeline Estimate
| Phase | Duration | What |
|-------|----------|------|
| Setup | 1 week | React Native project, Expo config, Supabase auth integration |
| Core recording | 1-2 weeks | Mic capture, Groq API integration, basic UI |
| Polish | 1-2 weeks | Usage tracking, share intent, offline handling, UI polish |
| Testing | 1 week | Device testing, Play Store compliance |
| Submission | 1 week | Store listing, screenshots, review process |
| **Total** | **4-8 weeks** | From start to Play Store approval |

## Not in Mobile MVP (Future)
- iOS version (separate Apple Developer account, $99/year)
- Widget for home screen (quick-launch mic)
- Android keyboard integration (IME)
- Watch OS / Wear OS support
- Background transcription
