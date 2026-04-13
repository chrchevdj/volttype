import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../support/helpers.js';
import electronMock from '../mocks/electron.js';

describe('TextCleaner', () => {
  beforeEach(() => {
    vi.resetModules();
    electronMock.__electronMockState.fetchImpl = vi.fn();
    global.__VOLTTEST_ELECTRON__ = electronMock;
  });

  it('detects supported voice commands and extra parameters', async () => {
    const TextCleaner = (await import('../../src/text-cleaner.js')).default;
    const cleaner = new TextCleaner('gsk_test');

    expect(cleaner.detectCommand('make this more formal.')).toMatchObject({
      isCommand: true,
      command: 'formal',
      label: 'Making formal',
    });
    expect(cleaner.detectCommand('translate this to Danish')).toMatchObject({
      isCommand: true,
      command: 'translate',
      extra: 'Danish',
    });
    expect(cleaner.detectCommand('')).toEqual({ isCommand: false });
  });

  afterEach(() => {
    delete global.__VOLTTEST_ELECTRON__;
  });

  it('returns original text when command execution is unavailable or fails', async () => {
    const TextCleaner = (await import('../../src/text-cleaner.js')).default;
    const cleaner = new TextCleaner('');
    expect(await cleaner.executeCommand('formal', 'hello')).toBe('hello');

    cleaner.setApiKey('gsk_test');
    electronMock.__electronMockState.fetchImpl.mockRejectedValueOnce(new Error('network'));
    expect(await cleaner.executeCommand('formal', 'hello')).toBe('hello');
  });

  it('calls Groq with the expected command payload', async () => {
    const TextCleaner = (await import('../../src/text-cleaner.js')).default;
    const cleaner = new TextCleaner('gsk_test');
    electronMock.__electronMockState.fetchImpl.mockResolvedValueOnce(createJsonResponse({
      choices: [{ message: { content: 'Bonjour' } }],
    }));

    const result = await cleaner.executeCommand('translate', 'Hello', 'French');

    expect(result).toBe('Bonjour');
    const [, options] = electronMock.__electronMockState.fetchImpl.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.messages[0].content).toContain('French');
    expect(payload.messages[1].content).toBe('Hello');
  });

  it('skips raw output style and cleans punctuated text through Groq', async () => {
    const TextCleaner = (await import('../../src/text-cleaner.js')).default;
    const cleaner = new TextCleaner('gsk_test');

    expect(await cleaner.clean('raw text', 'raw')).toBe('raw text');

    electronMock.__electronMockState.fetchImpl.mockResolvedValueOnce(createJsonResponse({
      choices: [{ message: { content: 'Hello, world.' } }],
    }));

    const cleaned = await cleaner.clean('hello world', 'punctuated', 'Use VoltType spelling');
    expect(cleaned).toBe('Hello, world.');

    const [, options] = electronMock.__electronMockState.fetchImpl.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.messages[0].content).toContain('Use VoltType spelling');
    expect(payload.messages[0].content).toContain('fix punctuation and capitalization');
  });
});
