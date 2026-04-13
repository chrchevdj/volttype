import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTempDir, removeDir } from '../support/helpers.js';
import electronMock from '../mocks/electron.js';

describe('local storage modules', () => {
  let userDataDir;

  beforeEach(() => {
    vi.resetModules();
    userDataDir = createTempDir('volttype-storage-');
    electronMock.__electronMockState.userData = userDataDir;
    global.__VOLTTEST_ELECTRON__ = electronMock;
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  });

  afterEach(() => {
    delete global.__VOLTTEST_ELECTRON__;
    vi.restoreAllMocks();
    removeDir(userDataDir);
  });

  it('seeds and applies dictionary rules', async () => {
    const Dictionary = (await import('../../src/dictionary.js')).default;
    const dictionary = new Dictionary();

    expect(dictionary.getAll()).toHaveLength(6);
    dictionary.add('volttype', 'VoltType');
    dictionary.update(0, { enabled: false });

    expect(dictionary.apply('volttype period')).toBe('VoltType period');

    dictionary.remove(0);
    expect(dictionary.getAll()).toHaveLength(6);
  });

  it('stores and edits history entries while capping the list', async () => {
    const History = (await import('../../src/history.js')).default;
    const history = new History();

    history.add({ text: 'First note', duration: 10, engine: 'groq', language: 'en' });
    const [entry] = history.getAll();

    history.update(entry.id, 'Updated note');
    expect(history.get(entry.id)).toMatchObject({
      text: 'Updated note',
      originalText: 'First note',
    });

    for (let index = 0; index < 250; index++) {
      history.add({ text: `Entry ${index}` });
    }

    expect(history.getAll()).toHaveLength(200);
    history.clear();
    expect(history.getAll()).toEqual([]);
  });

  it('manages snippets', async () => {
    const Snippets = (await import('../../src/snippets.js')).default;
    const snippets = new Snippets();

    snippets.add('Follow-up', 'Thanks for the update.', 'email');
    const [snippet] = snippets.getAll();

    expect(snippet).toMatchObject({
      name: 'Follow-up',
      text: 'Thanks for the update.',
      category: 'email',
    });

    snippets.update(snippet.id, { text: 'Thanks for the detailed update.' });
    expect(snippets.get(snippet.id).text).toBe('Thanks for the detailed update.');

    snippets.remove(snippet.id);
    expect(snippets.getAll()).toEqual([]);
  });
});
