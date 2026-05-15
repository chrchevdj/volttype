import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTempDir, removeDir } from '../support/helpers.js';
import electronMock from '../mocks/electron.js';

describe('Settings', () => {
  let userDataDir;
  let originalUserProfile;

  beforeEach(() => {
    vi.resetModules();
    userDataDir = createTempDir('volttype-settings-');
    electronMock.__electronMockState.userData = userDataDir;
    electronMock.__electronMockState.fetchImpl = vi.fn();
    global.__VOLTTEST_ELECTRON__ = electronMock;
    originalUserProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    delete global.__VOLTTEST_ELECTRON__;
    process.env.USERPROFILE = originalUserProfile;
    removeDir(userDataDir);
  });

  it('loads sane defaults on first run', async () => {
    const Settings = (await import('../../src/settings.js')).default;
    const settings = new Settings();

    expect(settings.get('hotkey')).toBe('Ctrl+Shift+D');
    expect(settings.get('outputStyle')).toBe('punctuated');
    expect(settings.get('engine')).toBe('groq');
  });

  it('migrates legacy cleaned mode to punctuated', async () => {
    const settingsPath = path.join(userDataDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ version: 2, outputStyle: 'cleaned' }));

    const Settings = (await import('../../src/settings.js')).default;
    const settings = new Settings();
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    expect(settings.get('outputStyle')).toBe('punctuated');
    expect(saved.outputStyle).toBe('punctuated');
    expect(saved.version).toBe(3);
  });

  it('auto-detects a Groq key from a known env.master location', async () => {
    const fakeProfile = createTempDir('volttype-user-');
    process.env.USERPROFILE = fakeProfile;
    const envDir = path.join(fakeProfile, 'Desktop', 'Freelancing');
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(path.join(envDir, '.env.master'), 'GROQ_API_KEY=gsk_detected-key\n');

    const Settings = (await import('../../src/settings.js')).default;
    const settings = new Settings();

    expect(settings.get('groqApiKey')).toMatch(/^gsk_/);

    removeDir(fakeProfile);
  });

  it('persists set and update operations', async () => {
    const Settings = (await import('../../src/settings.js')).default;
    const settings = new Settings();

    settings.set('language', 'da');
    settings.update({ playSounds: false, theme: 'light' });

    const reloaded = new Settings();
    expect(reloaded.getAll()).toMatchObject({
      language: 'da',
      playSounds: false,
      theme: 'light',
    });
  });
});
