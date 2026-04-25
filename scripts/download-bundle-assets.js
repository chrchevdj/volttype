/**
 * Prebuild script — downloads whisper.cpp binary and base.en model
 * into local directories so electron-builder can bundle them into
 * the installer via extraResources.
 *
 * Run automatically before `npm run build` via "prebuild" script.
 * Safe to run multiple times — skips already-downloaded files.
 *
 * Output:
 *   models/ggml-base.en.bin    (~142 MB) → bundled as resources/models/
 *   whisper-bin/whisper-cli.exe (~6 MB)  → bundled as resources/whisper-cli.exe
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');
const BIN_DIR = path.join(ROOT, 'whisper-bin');

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
const MODEL_FILE = path.join(MODELS_DIR, 'ggml-base.en.bin');
const MODEL_SIZE = 142_000_000; // ~142 MB

const BINARY_ZIP_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip';
const BINARY_FILE = path.join(BIN_DIR, 'whisper-cli.exe');
const BINARY_ZIP = path.join(BIN_DIR, 'whisper-bin-x64.zip');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, dest, label) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  [SKIP] ${label} already exists.`);
      return resolve();
    }
    console.log(`  [DL] ${label} ...`);
    const file = fs.createWriteStream(dest + '.tmp');
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, { headers: { 'User-Agent': 'VoltType-Build/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest + '.tmp');
        return downloadFile(res.headers.location, dest, label).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          process.stdout.write(`\r  [DL] ${label}: ${pct}% (${(downloaded / 1e6).toFixed(1)} MB)`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          process.stdout.write('\n');
          fs.renameSync(dest + '.tmp', dest);
          resolve();
        });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('[PREBUILD] Downloading bundle assets for installer...');
  ensureDir(MODELS_DIR);
  ensureDir(BIN_DIR);

  // Download base.en model
  await downloadFile(MODEL_URL, MODEL_FILE, 'ggml-base.en.bin (~142 MB)');

  // Download whisper-cli binary (zip)
  if (!fs.existsSync(BINARY_FILE)) {
    await downloadFile(BINARY_ZIP_URL, BINARY_ZIP, 'whisper-bin-x64.zip (~6 MB)');
    // Extract whisper-cli.exe from zip using PowerShell
    console.log('  [EXTRACT] Extracting whisper-cli.exe...');
    execFileSync('powershell', [
      '-Command',
      `Expand-Archive -Path "${BINARY_ZIP}" -DestinationPath "${BIN_DIR}" -Force`
    ]);
    // Find and copy the binary — it may be in a subdirectory
    const entries = fs.readdirSync(BIN_DIR, { recursive: true });
    const cliEntry = entries.find(e => e.toString().endsWith('whisper-cli.exe'));
    if (cliEntry) {
      const src = path.join(BIN_DIR, cliEntry.toString());
      if (src !== BINARY_FILE) fs.copyFileSync(src, BINARY_FILE);
      console.log('  [OK] whisper-cli.exe extracted.');
    } else {
      console.warn('  [WARN] whisper-cli.exe not found in zip — binary will download at runtime.');
    }
  } else {
    console.log('  [SKIP] whisper-cli.exe already exists.');
  }

  console.log('[PREBUILD] Done. Builder will bundle models/ and whisper-bin/ into installer.');
}

main().catch((err) => {
  console.error('[PREBUILD ERROR]', err.message);
  // Don't fail the build — bundled model is optional. App falls back to download-on-demand.
  process.exit(0);
});
