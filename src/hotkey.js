/**
 * Global hotkey manager with hold-to-talk support.
 *
 * Hold Ctrl+Space: records instantly, stops on release.
 * Debounced — ignores rapid retriggering.
 *
 * Why Ctrl+Space instead of Ctrl+Win:
 *   Windows intercepts ALL Win-key combos at the OS level.
 *   Ctrl+Space is ergonomic, not reserved by Windows, and works reliably.
 */
const { uIOhook, UiohookKey } = require('uiohook-napi');

// Space keycode in uiohook
const KEY_SPACE = UiohookKey.Space;

class HotkeyManager {
  constructor() {
    this._onStart = null;
    this._onStop = null;
    this._ctrlDown = false;
    this._spaceDown = false;
    this._recording = false;
    this._started = false;
    this._lastStopTime = 0;
    this._debounceMs = 400; // Ignore re-triggers within 400ms
  }

  setCallbacks(onStart, onStop) {
    this._onStart = onStart;
    this._onStop = onStop;
  }

  start() {
    if (this._started) return;

    uIOhook.on('keydown', (e) => {
      const wasReady = this._ctrlDown && this._spaceDown;

      if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) this._ctrlDown = true;
      if (e.keycode === KEY_SPACE) this._spaceDown = true;

      // Both pressed — start immediately (with debounce check)
      if (this._ctrlDown && this._spaceDown && !wasReady && !this._recording) {
        const now = Date.now();
        if (now - this._lastStopTime < this._debounceMs) {
          return; // Too soon after last stop — ignore
        }
        this._recording = true;
        console.log('[HOTKEY] Ctrl+Space DOWN — start recording');
        if (this._onStart) this._onStart();
      }
    });

    uIOhook.on('keyup', (e) => {
      if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) this._ctrlDown = false;
      if (e.keycode === KEY_SPACE) this._spaceDown = false;

      // Either key released while recording — stop
      if (this._recording && (!this._ctrlDown || !this._spaceDown)) {
        this._recording = false;
        this._lastStopTime = Date.now();
        console.log('[HOTKEY] Ctrl+Space UP — stop recording');
        if (this._onStop) this._onStop();
      }
    });

    try {
      uIOhook.start();
      this._started = true;
      console.log('[HOTKEY] Ready — hold Ctrl+Space to dictate');
    } catch (err) {
      console.error('[HOTKEY] Failed to start uIOhook:', err.message);
    }
  }

  stop() {
    if (!this._started) return;
    try { uIOhook.stop(); } catch {}
    this._started = false;
  }
}

module.exports = HotkeyManager;
