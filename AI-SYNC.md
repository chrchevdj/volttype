# VoltType AI Sync

> 🚨 **CROSS-AI RULE #0 — NO LYING.** Every entry below MUST include proof (tool_use ID, file path + diff, API response, or honest "I couldn't because Y"). Faking "done" between Marko and Codex is the only failure mode that breaks this protocol. See `_WORKSPACE/corp/state/CROSS-AI-RULES.md`.

Purpose: live coordination file for Codex, Marko Claude, Atlas, and future agents working on this project. Read this before changing the app. Append short updates after every meaningful change.

## Non-negotiable protections

- Project tier:
- Paying client/data protections:
- Do not touch:


## Workspace hard rules

1. No phantom completions: every "done" claim needs tool/use proof in the same turn or a clear verification artifact.
2. Charter sweep on rule change: corp-wide rule changes must be backported into live agent charters in the same session, or explicitly logged as not completed.
3. Charter must run: routines declared in charters need actual cron/n8n/hook/runtime execution, or must be marked `NOT-EXECUTING`.
4. `INTER_AGENT_LOG.md` is mandatory per meaningful run.
5. Audits must quote proof: claims that something exists or does not exist need tool evidence and a short output snippet.
## Current target

1.
2.
3.

## Current status

Approximate completion:

Done:

- 

Not done / blockers:

- 

## Required update format

Append new notes below. Keep each note short and factual.

```text
## Update - YYYY-MM-DD HH:mm - AgentName
- Changed:
- Verified:
- Risk/blocker:
- Next:
```

## Updates

## Update - 2026-05-08 07:27 - Codex
- Changed: Completed T-005 audit/fix/deploy pass. Replaced unverified named testimonial section with honest "Private Beta Notes" validation copy and updated stale offline service-worker copy.
- Verified: `npm.cmd run build` produced VoltType 1.2.1 Windows installer + portable; live curl returned 200 for `volttype.com` and `app.volttype.com`; deployed Pages preview `https://0d2b4bce.volttype.pages.dev`; Playwright live smoke found 0 console errors and 0 failed responses on preview, `volttype.com`, and `app.volttype.com`; preview/custom domain show Private Beta Notes and no old testimonial names/copy.
- Risk/blocker: `npm.cmd run test:ui` timed out at the 120s harness limit, so I used targeted Playwright live smoke instead. Remaining non-code blockers: real voice test by Djoko, Resend DNS verification, and live auto-update validation.
- Next: Marko/Chairman can do the human voice/DNS/auto-update checks; Codex should not start new VoltType features.



## Update - 2026-05-08 05:40 - Codex
- Changed: Audited VoltType build/live site/app; removed stale Scorecard dashboard claim from HANDOVER.
- Verified: `npm.cmd run build` produced Windows installer/portable; volttype.com 200; app.volttype.com 200; Playwright console smoke found 0 console errors and 0 bad responses on both live URLs.
- Risk/blocker: Repo had broad pre-existing dirty state; only HANDOVER.md was intentionally edited by Codex in this audit.
- Next: Deploy current website and smoke verify.
