/**
 * Launcher script with auto-restart watchdog.
 *
 * - Ensures ELECTRON_RUN_AS_NODE is unset (VS Code fix)
 * - Auto-restarts on crash (up to 5 times within 30 seconds)
 * - Resets restart counter after 30s of stable running
 */
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
let restarts = 0;
const MAX_RESTARTS = 5;
const STABLE_THRESHOLD = 30000; // 30s = consider it stable, reset counter

function launch() {
  const startTime = Date.now();

  const child = spawn(electronPath, ['.', ...args], {
    stdio: 'inherit',
    env,
    cwd: __dirname,
  });

  child.on('close', (code, signal) => {
    const uptime = Date.now() - startTime;

    // If it ran for more than 30s, reset the crash counter
    if (uptime > STABLE_THRESHOLD) {
      restarts = 0;
    }

    // Intentional quit (user clicked Quit from tray menu)
    if (code === 0 && !signal) {
      process.exit(0);
      return;
    }

    // Crash or unexpected exit — restart
    if (restarts < MAX_RESTARTS) {
      restarts++;
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.log(`[LAUNCHER] Exited (${reason}) after ${Math.round(uptime / 1000)}s — restarting (${restarts}/${MAX_RESTARTS})...`);
      setTimeout(launch, 1500);
    } else {
      console.log(`[LAUNCHER] Too many crashes (${MAX_RESTARTS}), giving up.`);
      process.exit(code || 1);
    }
  });
}

launch();
