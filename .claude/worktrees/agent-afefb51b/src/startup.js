/**
 * Windows auto-start management.
 * Uses Electron's built-in login item settings.
 */
const { app } = require('electron');

function setAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: ['--start-minimized'],
  });
}

function getAutoStartEnabled() {
  const settings = app.getLoginItemSettings({
    path: process.execPath,
    args: ['--start-minimized'],
  });
  return settings.openAtLogin;
}

module.exports = { setAutoStart, getAutoStartEnabled };
