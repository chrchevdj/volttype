# VoltType — Builder Prompt for Claude Code

> **Working directory:** `C:\Users\crcaw\Desktop\Freelancing\VoltType`
> **Paste this into Claude Code in VS Code**
> **Date:** 2026-04-01
> **Current Grade:** C+ → Target: B+

---

## CONTEXT

VoltType is an AI-powered desktop voice typing app (Electron) with a marketing landing page at volttype.com (Cloudflare Pages) and a backend API (Cloudflare Workers). The landing page is a single-file static HTML (`website/index.html`). The Electron app is in `main.js` + `renderer/` + `src/`. The API is in `backend/cloudflare-worker/`.

Read HANDOVER.md first for full context.

## CRITICAL FIXES (do these first, in order)

### Fix 1: INVESTIGATE & FIX AUTH — "Database error saving new user"
The signup flow at volttype.com calls Supabase directly (`POST /auth/v1/signup` on project `ceuymixybyaxpldgggin`). It returns "Database error saving new user". This blocks ALL conversions.

**Investigate:**
1. Check if there's a `profiles` table in Supabase that has a trigger on `auth.users` insert
2. Check RLS policies on any profile/user tables
3. Check Supabase auth settings (email confirmation, etc.)
4. The Supabase anon key and URL are in `website/index.html` line 536-537

**This is the #1 priority. Nothing else matters until signup works.**

### Fix 2: ADD EMAIL FORMAT VALIDATION
File: `website/index.html` around line 592
The current check is only `if (!email || !password)`. Add email regex validation:
```javascript
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  errEl.textContent = 'Please enter a valid email address';
  errEl.classList.remove('hidden');
  return;
}
```

### Fix 3: ADD MOBILE HAMBURGER MENU
File: `website/index.html`
Nav links (Features, Pricing, Download) are hidden below 768px with `display: none` and there's NO hamburger menu. Mobile users have zero navigation.

Add:
1. A hamburger icon button visible only on mobile (below 768px)
2. A slide-down or overlay menu with the three nav links
3. Toggle functionality with JavaScript
4. Smooth transition animation

### Fix 4: ADD FAVICON
Create favicon files and add to `website/index.html` `<head>`:
```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```
Generate a simple "V" or lightning bolt icon in the purple (#7c3aed) brand color.

### Fix 5: ADD OG IMAGE META TAG
File: `website/index.html` — add after line 13 (og:url):
```html
<meta property="og:image" content="https://volttype.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="https://volttype.com/og-image.png">
```
Also change line 14 from `<meta name="twitter:card" content="summary">` to `<meta name="twitter:card" content="summary_large_image">`

Note: The actual og-image.png (1200x630) needs to be created separately showing the app interface. For now, just add the meta tags.

### Fix 6: ADD JSON-LD STRUCTURED DATA
File: `website/index.html` — add in `<head>` before closing `</head>`:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "VoltType",
  "operatingSystem": "Windows 10, Windows 11",
  "applicationCategory": "ProductivityApplication",
  "offers": [
    {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    {"@type": "Offer", "price": "4.99", "priceCurrency": "USD"},
    {"@type": "Offer", "price": "8.99", "priceCurrency": "USD"}
  ],
  "description": "AI-powered voice typing for Windows. Speak naturally and your words appear in any app, 4x faster than typing."
}
</script>
```

### Fix 7: ADD SECURITY HEADERS
Create file: `website/_headers`
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: microphone=(), camera=(), geolocation=()
```

## AFTER FIXES — VERIFY

1. Test signup at volttype.com with a real email — should work or show email confirmation message
2. Test signup with invalid email format — should show validation error
3. Verify favicon appears in browser tab
4. Verify mobile hamburger menu works at < 768px
5. Test all nav anchor links (#features, #pricing, #download)
6. Check all pricing buttons still work
7. Verify privacy policy and terms of service links

## DEPLOY

Landing page (Cloudflare Pages):
```bash
cd website
npx wrangler pages deploy . --project-name volttype
```

Worker API (if changed):
```bash
cd backend/cloudflare-worker
npx wrangler deploy
```

## FILES TO TOUCH
- `website/index.html` — email validation, hamburger menu, OG image, JSON-LD, twitter card fix
- `website/_headers` — new file for security headers
- `website/favicon-32x32.png` — new file
- `website/apple-touch-icon.png` — new file
- Supabase dashboard — auth config investigation

## DO NOT
- Break the existing download link
- Change the Supabase project or API keys
- Modify the Electron app code (separate effort)
- Change pricing amounts
- Remove any existing working functionality
