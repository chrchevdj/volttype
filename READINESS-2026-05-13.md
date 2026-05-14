# VoltType Readiness - 2026-05-13

## Verdict

VoltType is close to first-customer ready, but not "turn on ads" ready. The product has real value, Stripe checkout is wired, Resend is verified, and the Windows build exists. The remaining risk is operational trust: install/update proof, one real purchase-email proof, and support/legal polish.

## Current Proof

- Website: `https://volttype.com` returns HTTP 200.
- App: `https://app.volttype.com` returns HTTP 200.
- Resend API: `volttype.com` status is `verified`, sending is `enabled`, receiving is `disabled`.
- DNS:
  - `resend._domainkey.volttype.com` TXT resolves and matches the verified DKIM record.
  - `send.volttype.com` TXT resolves as `v=spf1 include:amazonses.com ~all`.
  - `send.volttype.com` MX resolves to `feedback-smtp.eu-west-1.amazonses.com`, priority `10`.
- Build artifacts exist locally for `1.0.1`, `1.2.0`, and `1.2.1` in `dist/`.
- Current app package version is `1.2.1`.

## Dirty Tree Decision

The repo had broad pre-existing uncommitted work before this pass: desktop app code, Android package files, tests, website redirects, docs, local QA artifacts, models, and Whisper binaries. I did not revert or sweep those changes. This pass only adds readiness/status documentation and AI-SYNC notes unless explicitly stated.

## P0 Before First Paid Customer

| Area | Severity | Status | Action | Estimate |
|---|---:|---|---|---:|
| Welcome email after checkout | P0 | Not live-smoked in this pass | Run a Stripe test-mode checkout or Stripe CLI webhook in a safe test env, confirm Resend message arrives from `noreply@volttype.com`. Do not use a real card. | 30-60 min |
| Auto-updater | P0 | Code/build artifacts exist; fresh-machine v1.0.x -> v1.2.1 not manually proven here | Use a clean Windows user/profile or VM, install `1.0.1`, launch, wait for update, confirm `1.2.1` lands. | 45-90 min |
| Real dictation UX | P0 | Still needs human voice/device smoke | Chairman should dictate in Chrome, Gmail, Notepad, and one non-browser app. Verify no silent fallback to paid Groq and no stuck recording state. | 30 min |

## P1 Before Any Paid Traffic

| Area | Severity | Status | Action | Estimate |
|---|---:|---|---|---:|
| Install UX | P1 | Windows installer exists | Add a short "Windows may warn you" install note, plus one screenshot or GIF. Code signing remains deferred unless sales justify cost. | 1-2h |
| Conversion funnel | P1 | Checkout CTA wired | Add a tiny "Try locally first" path and one support email CTA near pricing. | 1h |
| Support | P1 | `support@volttype.com` referenced | Create canned replies for install warning, microphone permission, refund, local model download, and update failure. | 1h |
| Legal | P1 | Privacy/Terms exist | Add an explicit "no medical/legal transcription guarantees" and refund route summary in pricing FAQ. | 1h |

## P2 Polish

| Area | Severity | Status | Action | Estimate |
|---|---:|---|---|---:|
| Deliverability monitoring | P2 | Resend verified | Add a weekly smoke that sends one internal welcome-email test and checks Resend status. | 1h |
| Marketing | P2 | Site is serviceable | Add one honest demo video and one "for RSI / long writing" landing section. | 2-4h |
| Metrics | P2 | Checkout/API exists | Track install/download -> checkout -> active subscription funnel. | 2h |

## What Is Blocking First Paid Customer?

The blocker is not DNS anymore. The blocker is trust proof:

1. Does a clean Windows install update correctly?
2. Does a completed checkout send a branded welcome email?
3. Does the app behave correctly with Chairman's real microphone and daily writing tools?

Once those three are green, VoltType can take a first customer quietly. It should not get paid traffic until those are green.
