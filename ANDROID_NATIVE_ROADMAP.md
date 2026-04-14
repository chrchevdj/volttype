# VoltType Android — Native Features Roadmap

These are the remaining Android features. Each requires **native Android code** (Kotlin/Java) that cannot be built inside Expo Managed workflow — they must live in a bare React Native project or custom Expo dev client with native modules.

## Why These Require Native Work

Expo Managed gives us camera, audio, storage, push — but **system-level integrations** (IMEs, foreground overlay services, home widgets, Quick Settings tiles, share targets) are OS-level extension points that only a custom Android build can register.

To ship these, we need to:
1. Run `npx expo prebuild` to generate the native `android/` folder, **or**
2. Use EAS Build with a custom dev client and native modules

Then open `android/` in Android Studio for IME/overlay testing (they can't be tested on emulator properly in some cases — you need a physical device).

---

## 1. Android IME (Keyboard)

**Goal:** A system-wide VoltType keyboard that users pick in Settings → Languages & Input. Tap the mic key → dictate → Groq transcribes → injects text into whatever app is focused.

**What it looks like in code:**
- `InputMethodService` subclass in Kotlin (`VoltTypeIME.kt`)
- `method.xml` in `res/xml/` registering the IME
- `AndroidManifest.xml` service declaration with `BIND_INPUT_METHOD` permission
- Layout: small keyboard surface with a giant mic button + status row (+ optional undo/redo)
- Recording via `MediaRecorder` (not expo-av — expo-av won't run in IME context)
- Upload to worker `/v1/transcribe`, commit result via `InputConnection.commitText()`

**Gotchas:**
- IME cannot use most Expo modules. You're in a pure Android service context.
- Microphone permission must be requested from the host activity (we launch a tiny settings activity from the IME to ask).
- Users must **enable** the keyboard in Settings and **switch to it** with the globe key. Plan an onboarding flow.

**Estimated effort:** 2-3 days for MVP.

---

## 2. Floating Bubble Overlay

**Goal:** Flow-style floating bubble (like Messenger Chat Heads) that stays on top of any app. Tap → record → paste to clipboard OR inject via Accessibility Service.

**What it looks like in code:**
- `Service` with `WindowManager` adding a view with `TYPE_APPLICATION_OVERLAY`
- Request `SYSTEM_ALERT_WINDOW` permission (user sends to Settings → "Display over other apps")
- Foreground service notification (required by Android 8+)
- Drag handler so the bubble follows touches
- Same recording/upload flow as the IME

**Injection options (in order of feasibility):**
1. **Clipboard + toast** — "Copied. Paste it." (simple, always works)
2. **Accessibility Service** — simulate paste/type events (powerful, needs user to enable in Settings)
3. **IME trick** — switch to VoltType keyboard momentarily (complex)

**Competitor reference:** Flow (on Play Store) does exactly this.

**Estimated effort:** 2-3 days. The bubble UI is fast; the injection is where you spend time.

---

## 3. Share Sheet Target

**Goal:** User shares text from any app → picks "VoltType" in the share sheet → text goes into AI Notes or gets rewritten.

**What it looks like in code:**
- `AndroidManifest.xml` `<intent-filter>` with `SEND` action, `text/plain` MIME
- Activity that reads `Intent.EXTRA_TEXT` and shows the VoltType UI
- Could be the existing React Native `App` with a new initial route

**Estimated effort:** Half a day. This is the easiest of the five.

---

## 4. Home Screen Widget

**Goal:** Resizable widget on the home screen. 1-tap mic → recording starts. 2-tap → stop → text copied.

**What it looks like in code:**
- `AppWidgetProvider` class
- `res/xml/widget_info.xml`
- `res/layout/widget_layout.xml` (limited to `RemoteViews` components — no fancy RN)
- Widget clicks launch a `PendingIntent` to a recording activity or service
- Optionally: show last-transcribed-text on the widget

**Estimated effort:** 1 day for a basic 1-tap widget.

---

## 5. Quick Settings Tile

**Goal:** Tile in the pull-down Quick Settings (like Wi-Fi, Bluetooth). Tap → start/stop recording → result in clipboard.

**What it looks like in code:**
- `TileService` subclass (API 24+)
- Manifest declaration with `BIND_QUICK_SETTINGS_TILE` permission
- User drags tile into their Quick Settings panel manually (one-time setup)
- Tile state: idle → recording → processing → idle

**Estimated effort:** Half a day once the recording infrastructure exists.

---

## Shared Infrastructure to Build First

Before any of the above, extract these to a **shared Kotlin module** so all five features use the same code:

1. **RecorderManager** — wraps `MediaRecorder`, saves to temp file
2. **TranscribeClient** — uploads to `volttype-api.crcaway.workers.dev/v1/transcribe` with Bearer token
3. **TokenStore** — reads Supabase session from EncryptedSharedPreferences (React Native side writes it)
4. **ClipboardHelper** — copies text, shows toast

All five features then become thin UI layers on top of these.

---

## Rollout Order (when you're ready)

1. `expo prebuild` → commit `android/` folder
2. Build shared Kotlin infrastructure (RecorderManager, TranscribeClient, TokenStore)
3. **Share sheet** (easiest, quick win)
4. **Quick Settings tile** (quick, builds muscle for service-style features)
5. **Home widget**
6. **Floating bubble** (biggest UX win after the keyboard)
7. **IME keyboard** (highest impact, highest complexity)

---

## Testing Notes

- **Physical device required** for IME and floating bubble. Emulator overlay permissions are unreliable.
- Users must manually enable: the keyboard in Settings, the overlay permission, the accessibility service, and drag the QS tile. Build an onboarding checklist screen.
- Play Store will review IME and Accessibility Service usage carefully — write clear justifications.

## Why This Isn't Blocked-In-Expo

If you ever want to stay in Expo Managed longer: none of the five features above can be done. Expo doesn't expose system IMEs, window overlays, widgets, share targets, or QS tiles. You have to prebuild.

The good news: **prebuild is one-way but reversible** (keep a git tag before running it). Nothing else in the app breaks.
