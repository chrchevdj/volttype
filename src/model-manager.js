/**
 * Model Manager — downloads and caches whisper.cpp binary + GGML models.
 *
 * On first use, fetches the whisper.cpp CLI binary from GitHub and the
 * GGML model from HuggingFace, storing them in the app's userData directory.
 * Subsequent launches find the cached files and skip the download.
 *
 * whisper.cpp: MIT license (Georgi Gerganov)
 * Whisper GGML models: MIT license (OpenAI)
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

// GGML model variants — quantized for small size + fast inference.
// "base.en" = English-only, ~142 MB, fast, great for dictation.
// "tiny.en" = English-only, ~75 MB, fastest, good enough for short clips.
// "small.en" = English-only, ~466 MB, best quality English.
// "small"   = multilingual, ~466 MB, slower, better quality.
const MODELS = {
  'tiny.en': {
    file: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    size: 75_000_000,
    label: 'Whisper Tiny (English, fastest)',
  },
  'base.en': {
    file: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    size: 142_000_000,
    label: 'Whisper Base (English, recommended)',
  },
  'small.en': {
    file: 'ggml-small.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    size: 466_000_000,
    label: 'Whisper Small (English, best quality)',
  },
  small: {
    file: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: 466_000_000,
    label: 'Whisper Small (Multilingual)',
  },
};

// whisper.cpp release info — update when new releases come out
const WHISPER_CPP = {
  version: '1.8.4',
  windows: {
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip',
    binary: 'whisper-cli.exe',
    size: 6_000_000,
  },
};

class ModelManager {
  constructor() {
    this._modelsDir = null;
    this._binDir = null;
    this._onProgress = null;
  }

  /** Call once after app is ready. */
  init() {
    this._modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    this._binDir = path.join(app.getPath('userData'), 'whisper-bin');
    if (!fs.existsSync(this._modelsDir)) {
      fs.mkdirSync(this._modelsDir, { recursive: true });
    }
    if (!fs.existsSync(this._binDir)) {
      fs.mkdirSync(this._binDir, { recursive: true });
    }
  }

  /** Register a progress callback: (percent: number, label: string) => void */
  onProgress(fn) {
    this._onProgress = fn;
  }

  /** Check if a model variant is fully downloaded and binary is available. */
  isModelReady(variant = 'base.en') {
    const model = MODELS[variant];
    if (!model) return false;
    const modelPath = path.join(this._modelsDir, model.file);
    const binaryPath = this._getBinaryPath();
    return fs.existsSync(modelPath) && fs.existsSync(binaryPath);
  }

  /** Get paths needed by LocalSTT: { model, binary } */
  getModelPaths(variant = 'base.en') {
    const model = MODELS[variant];
    if (!model) throw new Error(`Unknown model variant: ${variant}`);
    return {
      model: path.join(this._modelsDir, model.file),
      binary: this._getBinaryPath(),
    };
  }

  /** Get the whisper-cli binary path */
  _getBinaryPath() {
    if (process.platform === 'win32') {
      return path.join(this._binDir, WHISPER_CPP.windows.binary);
    }
    // macOS/Linux: would need different binary names
    return path.join(this._binDir, 'whisper-cli');
  }

  /** Download model + binary if not already cached. Returns paths. */
  async ensureModel(variant = 'base.en') {
    const model = MODELS[variant];
    if (!model) throw new Error(`Unknown model variant: ${variant}`);

    // Download binary first (small, fast)
    await this._ensureBinary();

    // Download model
    const modelPath = path.join(this._modelsDir, model.file);
    if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > model.size * 0.9) {
      console.log(`[MODEL] ${variant} already cached.`);
    } else {
      console.log(`[MODEL] Downloading ${model.label} (~${Math.round(model.size / 1e6)} MB)...`);
      await this._downloadFile(model.url, modelPath, (bytes) => {
        const percent = Math.round((bytes / model.size) * 100);
        const label = `Downloading ${model.label}: ${percent}%`;
        if (this._onProgress) this._onProgress(Math.min(percent, 99), label);
      });
    }

    if (this._onProgress) this._onProgress(100, 'Model ready');
    console.log(`[MODEL] ${model.label} ready.`);
    return this.getModelPaths(variant);
  }

  /** Ensure the whisper.cpp binary is downloaded and extracted. */
  async _ensureBinary() {
    const binaryPath = this._getBinaryPath();
    if (fs.existsSync(binaryPath)) {
      console.log('[MODEL] whisper-cli binary already cached.');
      return;
    }

    if (process.platform !== 'win32') {
      throw new Error('Local STT binary auto-download is only supported on Windows. Install whisper.cpp manually.');
    }

    console.log('[MODEL] Downloading whisper.cpp binary...');
    if (this._onProgress) this._onProgress(0, 'Downloading whisper.cpp...');

    const zipPath = path.join(this._binDir, 'whisper-bin-x64.zip');
    await this._downloadFile(WHISPER_CPP.windows.url, zipPath, () => {});

    // Extract using PowerShell (available on all Windows 10+)
    console.log('[MODEL] Extracting whisper.cpp...');
    await new Promise((resolve, reject) => {
      execFile('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${this._binDir}' -Force`,
      ], { timeout: 60000 }, (error) => {
        if (error) return reject(new Error('Failed to extract: ' + error.message));
        resolve();
      });
    });

    // Find the binary (might be in a subdirectory)
    if (!fs.existsSync(binaryPath)) {
      // Search for it recursively
      const found = this._findFileRecursive(this._binDir, WHISPER_CPP.windows.binary);
      if (found && found !== binaryPath) {
        fs.copyFileSync(found, binaryPath);
        console.log('[MODEL] Moved binary to:', binaryPath);
      }
    }

    // Copy DLLs next to binary (ONNX Runtime, etc.)
    this._copyDllsNextToBinary();

    // Clean up zip
    try { fs.unlinkSync(zipPath); } catch {}

    if (!fs.existsSync(binaryPath)) {
      throw new Error('whisper-cli binary not found after extraction. Check: ' + this._binDir);
    }

    console.log('[MODEL] whisper-cli ready:', binaryPath);
  }

  /** Copy any DLLs from extracted zip to the binary directory. */
  _copyDllsNextToBinary() {
    const binaryDir = path.dirname(this._getBinaryPath());
    // Find all .dll files in the bin directory tree
    const copyDlls = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            copyDlls(fullPath);
          } else if (entry.name.endsWith('.dll') && dir !== binaryDir) {
            const dest = path.join(binaryDir, entry.name);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(fullPath, dest);
            }
          }
        }
      } catch {}
    };
    copyDlls(this._binDir);
  }

  /** Find a file recursively in a directory. */
  _findFileRecursive(dir, filename) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = this._findFileRecursive(fullPath, filename);
          if (found) return found;
        } else if (entry.name === filename) {
          return fullPath;
        }
      }
    } catch {}
    return null;
  }

  /** Get available model variants and their status. */
  listModels() {
    return Object.entries(MODELS).map(([key, model]) => ({
      variant: key,
      label: model.label,
      totalSizeMB: Math.round(model.size / 1e6),
      ready: this.isModelReady(key),
    }));
  }

  /** Delete a downloaded model. */
  deleteModel(variant) {
    const model = MODELS[variant];
    if (!model) return;
    const modelPath = path.join(this._modelsDir, model.file);
    try { fs.unlinkSync(modelPath); } catch {}
  }

  /** Download a file with redirect following. */
  _downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const tmpDest = dest + '.tmp';
      const file = fs.createWriteStream(tmpDest);
      let downloadedBytes = 0;

      const request = (requestUrl) => {
        const parsedUrl = new URL(requestUrl);
        const proto = parsedUrl.protocol === 'https:' ? https : http;
        proto
          .get(requestUrl, { headers: { 'User-Agent': 'VoltType/1.0' } }, (res) => {
            // Follow redirects (HuggingFace & GitHub return 302)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              let loc = res.headers.location;
              // Handle relative redirects
              if (loc.startsWith('/')) {
                loc = parsedUrl.protocol + '//' + parsedUrl.hostname + loc;
              }
              return request(loc);
            }

            if (res.statusCode !== 200) {
              file.close();
              try { fs.unlinkSync(tmpDest); } catch {}
              return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            }

            res.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              if (onProgress) onProgress(downloadedBytes);
            });

            res.pipe(file);

            file.on('finish', () => {
              file.close(() => {
                // Rename tmp → final
                try {
                  if (fs.existsSync(dest)) fs.unlinkSync(dest);
                  fs.renameSync(tmpDest, dest);
                } catch (e) {
                  return reject(new Error('Failed to save file: ' + e.message));
                }
                resolve();
              });
            });
          })
          .on('error', (err) => {
            file.close();
            try { fs.unlinkSync(tmpDest); } catch {}
            reject(err);
          });
      };

      request(url);
    });
  }
}

module.exports = new ModelManager();
