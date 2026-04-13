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

  it('learns corrections even when text has punctuation differences', async () => {
    const VocabLearner = (await import('../../src/vocab-learner.js')).default;
    const learner = new VocabLearner();

    // Simulates real use: original has period, corrected has different word with period
    learner.learnCorrection(
      'I spoke with Brent Puso today.',
      'I spoke with BrandPulso today.'
    );

    const corrections = learner.getCorrections();
    expect(corrections['brent']).toBe('BrandPulso');
    expect(corrections['puso']).toBeUndefined(); // "puso" maps to nothing — it's part of multi-word swap
    expect(learner.getStats().totalCorrections).toBe(1);
  });

  it('handles case-only corrections by learning personal terms', async () => {
    const VocabLearner = (await import('../../src/vocab-learner.js')).default;
    const learner = new VocabLearner();

    // Case-only changes don't create word corrections (lowercase match),
    // but the corrected capitalization IS learned as a personal term
    learner.learnCorrection('meeting with myclienta team', 'meeting with MyClienta team');

    expect(learner.getTerms()).toContain('MyClienta');
    expect(learner.getStats().totalCorrections).toBe(1);
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
