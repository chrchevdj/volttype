import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import electronMock from '../mocks/electron.js';

describe('startup helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    electronMock.__electronMockState.loginSettings = { openAtLogin: false };
    global.__VOLTTEST_ELECTRON__ = electronMock;
    process.execPath = 'C:/Program Files/VoltType/VoltType.exe';
  });

  it('delegates autostart settings to Electron', async () => {
    const { setAutoStart, getAutoStartEnabled } = await import('../../src/startup.js');

    setAutoStart(true);

    expect(electronMock.__electronMockState.loginSettings).toMatchObject({
      openAtLogin: true,
      path: process.execPath,
      args: ['--start-minimized'],
    });
    expect(getAutoStartEnabled()).toBe(true);
  });

  afterEach(() => {
    delete global.__VOLTTEST_ELECTRON__;
  });
});
