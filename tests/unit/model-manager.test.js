/**
 * Unit tests for src/model-manager.js — GGML model + whisper.cpp binary manager.
 *
 * model-manager.js uses require('electron').app — we need to inject a mock
 * before the module loads. We do this by pre-populating require.cache.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const tmpDir = path.join(os.tmpdir(), 'volttype-mm-test-' + Date.now());

// We need to inject a fake 'electron' module into Node's require cache
// BEFORE model-manager.js is loaded. This is the only reliable way
// to mock electron for CJS modules in vitest.
const require_ = createRequire(import.meta.url);
const electronCacheKey = require_.resolve('electron');
const originalElectronCache = require_.cache[electronCacheKey];

// Inject fake electron
require_.cache[electronCacheKey] = {
  id: electronCacheKey,
  filename: electronCacheKey,
  loaded: true,
  exports: {
    app: {
      getPath: () => tmpDir,
    },
  },
};

// Now clear any cached model-manager and re-require
const mmPath = require_.resolve('../../src/model-manager.js');
delete require_.cache[mmPath];
const modelManager = require_(mmPath);

describe('ModelManager', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    modelManager.init();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  afterAll(() => {
    // Restore original electron cache entry
    if (originalElectronCache) {
      require_.cache[electronCacheKey] = originalElectronCache;
    } else {
      delete require_.cache[electronCacheKey];
    }
  });

  it('creates whisper-models and whisper-bin directories on init', () => {
    expect(fs.existsSync(path.join(tmpDir, 'whisper-models'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'whisper-bin'))).toBe(true);
  });

  it('reports model as not ready when files are missing', () => {
    expect(modelManager.isModelReady('base.en')).toBe(false);
    expect(modelManager.isModelReady('tiny.en')).toBe(false);
  });

  it('returns false for unknown model variants', () => {
    expect(modelManager.isModelReady('nonexistent')).toBe(false);
  });

  it('reports model as ready when model file and binary both exist', () => {
    const modelPath = path.join(tmpDir, 'whisper-models', 'ggml-base.en.bin');
    fs.writeFileSync(modelPath, 'fake-model-data');

    const binaryPath = path.join(tmpDir, 'whisper-bin', 'whisper-cli.exe');
    fs.writeFileSync(binaryPath, 'fake-binary');

    expect(modelManager.isModelReady('base.en')).toBe(true);
  });

  it('returns correct paths for base.en variant', () => {
    const paths = modelManager.getModelPaths('base.en');
    expect(paths.model).toContain('ggml-base.en.bin');
    expect(paths.model).toContain('whisper-models');
    expect(paths.binary).toContain('whisper-cli');
    expect(paths.binary).toContain('whisper-bin');
  });

  it('returns correct paths for tiny.en variant', () => {
    const paths = modelManager.getModelPaths('tiny.en');
    expect(paths.model).toContain('ggml-tiny.en.bin');
  });

  it('returns correct paths for small.en variant', () => {
    const paths = modelManager.getModelPaths('small.en');
    expect(paths.model).toContain('ggml-small.en.bin');
  });

  it('returns correct paths for multilingual small variant', () => {
    const paths = modelManager.getModelPaths('small');
    expect(paths.model).toContain('ggml-small.bin');
    expect(paths.model).not.toContain('ggml-small.en');
  });

  it('throws for unknown variant in getModelPaths', () => {
    expect(() => modelManager.getModelPaths('nonexistent')).toThrow('Unknown model variant');
  });

  it('lists all 4 model variants', () => {
    const models = modelManager.listModels();
    expect(models).toHaveLength(4);

    const variants = models.map(m => m.variant);
    expect(variants).toContain('tiny.en');
    expect(variants).toContain('base.en');
    expect(variants).toContain('small.en');
    expect(variants).toContain('small');
  });

  it('lists models with correct metadata', () => {
    const models = modelManager.listModels();
    const baseEn = models.find(m => m.variant === 'base.en');

    expect(baseEn.label).toContain('Base');
    expect(baseEn.label).toContain('English');
    expect(baseEn.totalSizeMB).toBe(142);
    expect(baseEn.ready).toBe(false);
  });

  it('lists model as ready when files exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'whisper-models', 'ggml-tiny.en.bin'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'whisper-bin', 'whisper-cli.exe'), 'x');

    const models = modelManager.listModels();
    const tinyEn = models.find(m => m.variant === 'tiny.en');
    expect(tinyEn.ready).toBe(true);
  });

  it('deletes a model file', () => {
    const modelFile = path.join(tmpDir, 'whisper-models', 'ggml-base.en.bin');
    fs.writeFileSync(modelFile, 'data');
    expect(fs.existsSync(modelFile)).toBe(true);

    modelManager.deleteModel('base.en');
    expect(fs.existsSync(modelFile)).toBe(false);
  });

  it('does nothing when deleting nonexistent variant', () => {
    modelManager.deleteModel('nonexistent');
    // Should not throw
  });

  it('does nothing when deleting already-removed model', () => {
    modelManager.deleteModel('base.en');
    // Should not throw
  });

  it('registers progress callback', () => {
    const cb = vi.fn();
    modelManager.onProgress(cb);
    expect(modelManager._onProgress).toBe(cb);
  });

  it('ensureModel throws for unknown variant', async () => {
    await expect(modelManager.ensureModel('nonexistent')).rejects.toThrow('Unknown model variant');
  });
});
