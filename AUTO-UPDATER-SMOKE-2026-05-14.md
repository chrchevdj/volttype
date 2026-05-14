# VoltType Auto-Updater Smoke - 2026-05-14

## Result

Config and release-channel audit: PASS.

Real clean-install auto-update smoke: NOT RUN in this pass.

## What Is Present

- `package.json` version is `1.2.1`.
- `electron-updater` is installed.
- `main.js` imports `autoUpdater` and calls `autoUpdater.checkForUpdatesAndNotify()`.
- GitHub publish target is configured:
  - owner: `chrchevdj`
  - repo: `volttype-releases`
- Local release artifacts exist in `dist/`:
  - `VoltType Setup 1.0.1.exe`
  - `VoltType-Setup-1.2.0.exe`
  - `VoltType-Setup-1.2.1.exe`
  - `latest.yml`
- GitHub Releases now has `v1.2.1` marked as latest in `chrchevdj/volttype-releases`.
- Direct `v1.2.1/latest.yml` reports:
  - `version: 1.2.1`
  - `path: VoltType-Setup-1.2.1.exe`

## What Still Needs Chairman's Machine

A real auto-update smoke requires a clean installed app profile:

1. Install `1.0.1`.
2. Launch it.
3. Wait for update check.
4. Confirm the app downloads and applies `1.2.1`.
5. Relaunch and verify the version shown/runtime behavior.

I did not have a clean fresh Windows profile/VM in this pass, so the config/release channel is green but the end-to-end installed-app upgrade is still unproven.

## Next Exact Test

Use a throwaway Windows user or VM, install the old `1.0.1` installer from `dist/`, open VoltType, wait 1-2 minutes, and confirm it upgrades to `1.2.1` from GitHub Releases.
