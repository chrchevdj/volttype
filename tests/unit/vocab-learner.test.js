import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTempDir, removeDir } from '../support/helpers.js';
import electronMock from '../mocks/electron.js';

describe('VocabLearner', () => {
  let userDataDir;

  beforeEach(() => {
    vi.resetModules();
    userDataDir = createTempDir('volttype-vocab-');
    electronMock.__electronMockState.userData = userDataDir;
    global.__VOLTTEST_ELECTRON__ = electronMock;
  });

  afterEach(() => {
    delete global.__VOLTTEST_ELECTRON__;
    removeDir(userDataDir);
  });

  it('learns useful words and personal terms from dictations', async () => {
    const VocabLearner = (await import('../../src/vocab-learner.js')).default;
    const learner = new VocabLearner();

    learner.learn('hello from Acme', 'Hello from Acme Cloud platform');

    expect(learner.getTerms()).toContain('Acme');
    expect(learner.getWhisperPrompt()).toContain('Acme');
    expect(learner.getStats().vocabSize).toBeGreaterThan(0);
  });

  it('learns explicit user corrections and exposes cleaner context', async () => {
    const VocabLearner = (await import('../../src/vocab-learner.js')).default;
    const learner = new VocabLearner();

    learner.learnCorrection('please email jon about voltype', 'Please email John about VoltType');

    const corrections = learner.getCorrections();
    expect(corrections.jon).toBe('John');
    expect(learner.getTerms()).toContain('VoltType');
    expect(learner.getCleanerContext()).toContain('"jon" should be "John"');
  });

  it('updates style notes and prunes low-frequency vocabulary over time', async () => {
    const VocabLearner = (await import('../../src/vocab-learner.js')).default;
    const learner = new VocabLearner();

    for (let index = 0; index < 50; index++) {
      learner.learn(
        `Question ${index}?`,
        'Can we review the migration plan today? Please include Acme status updates.'
      );
    }

    const context = learner.getCleanerContext();
    expect(context).toContain('Style observations:');
    expect(learner.getStats().totalDictations).toBe(50);
    expect(learner.getStats().vocabSize).toBeGreaterThan(0);
  });
});
