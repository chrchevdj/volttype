/**
 * Text injection service.
 * Pastes text into the previously focused application.
 *
 * Uses native Windows API via PowerShell for reliability.
 * Focuses target window, sets clipboard, sends Ctrl+V.
 */
const { clipboard } = require('electron');
const { exec, execSync } = require('child_process');

// Cache: the HWND of the foreground window when recording started
let _savedHwnd = null;

/**
 * Save the currently focused window handle. Call this BEFORE recording starts.
 * Uses a fast native call — takes <5ms.
 */
function saveForegroundWindow() {
  try {
    const result = execSync(
      'powershell -NoProfile -Command "Add-Type -MemberDefinition \'[DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow();\' -Name U -Namespace U -PassThru | Out-Null; [U.U]::GetForegroundWindow().ToInt64()"',
      { windowsHide: true, timeout: 2000 }
    ).toString().trim();
    _savedHwnd = result;
    console.log('[INJECT] Saved foreground HWND:', _savedHwnd);
  } catch (e) {
    _savedHwnd = null;
    console.log('[INJECT] Could not save HWND:', e.message);
  }
}

/**
 * Inject text by focusing the saved window and pasting from clipboard.
 */
async function injectText(text) {
  if (!text || text.trim().length === 0) {
    console.log('[INJECT] No text');
    return;
  }
  console.log(`[INJECT] Pasting ${text.length} chars`);

  // Save old clipboard
  let oldClip = '';
  try { oldClip = clipboard.readText(); } catch {}

  // Set text to clipboard
  clipboard.writeText(text);

  // Build PS command: focus saved window + Ctrl+V
  const focusCmd = _savedHwnd
    ? `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);' -Name U -Namespace U -PassThru | Out-Null; [U.U]::SetForegroundWindow([IntPtr]${_savedHwnd}); Start-Sleep -Milliseconds 100;`
    : 'Start-Sleep -Milliseconds 100;';

  const psScript = `${focusCmd} Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
      windowsHide: true,
      timeout: 6000,
    }, (err) => {
      if (err) {
        console.error('[INJECT] Paste failed:', err.message);
        console.log('[INJECT] Text is in clipboard — Ctrl+V to paste manually');
      } else {
        console.log('[INJECT] Pasted OK');
      }

      // Restore clipboard
      setTimeout(() => {
        try { if (oldClip) clipboard.writeText(oldClip); } catch {}
        resolve();
      }, 600);
    });
  });
}

function cleanup() {}

module.exports = { injectText, saveForegroundWindow, cleanup };
