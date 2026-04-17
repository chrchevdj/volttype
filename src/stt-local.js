/**
 * Local Speech-to-Text engine using whisper.cpp subprocess.
 *
 * Runs entirely on the user's CPU — no cloud, no API keys, $0 cost.
 * Same interface as GroqSTT so the caller can swap transparently.
 *
 * Audio flow:
 *   1. Renderer captures WebM/Opus → sends base64 to main process.
 *   2. ffmpeg converts WebM → 16 kHz mono WAV (temp file).
 *   3. whisper.cpp CLI transcribes the WAV → text on stdout.
 *   4. This module parses the text and returns it.
 *
 * Model files are managed by model-manager.js (auto-downloaded on first use).
 * whisper.cpp binary is also auto-downloaded by model-manager.js.
 *
 * Why subprocess instead of native addon?
 *   - sherpa-onnx WASM can't handle model files (NODEFS broken, MEMFS OOM)
 *   - sherpa-onnx-node native addon blocked by Windows Application Control
 *   - whisper.cpp subprocess works everywhere, same pattern as ffmpeg
 *   - MIT licensed, same Whisper model quality
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');

class LocalSTT {
  constructor() {
    this._modelPath = null;    // path to GGML model file
    this._whisperPath = null;  // path to whisper-cli binary
    this._modelVariant = 'base.en';
    this._ready = false;
  }

  /**
   * Initialize with downloaded model and binary paths.
   * @param {object} paths - { model, binary } absolute paths
   * @param {string} [variant='base.en'] - model variant name
   */
  async init(paths, variant = 'base.en') {
    this._modelPath = paths.model;
    this._whisperPath = paths.binary;
    this._modelVariant = variant;

    // Verify files exist
    if (!fs.existsSync(this._modelPath)) {
      throw new Error('Whisper model not found: ' + this._modelPath);
    }
    if (!fs.existsSync(this._whisperPath)) {
      throw new Error('whisper-cli binary not found: ' + this._whisperPath);
    }

    // Verify ffmpeg is available
    const ffmpegPath = this._findFfmpeg();
    if (!ffmpegPath) {
      throw new Error('ffmpeg not found. Local STT needs ffmpeg to convert audio. It should be bundled with VoltType — if you see this error, please reinstall the app or install ffmpeg manually (ffmpeg.org).');
    }

    this._ready = true;
    console.log(`[LOCAL-STT] Ready (${variant}, binary: ${path.basename(this._whisperPath)})`);
  }

  get isReady() {
    return this._ready;
  }

  /**
   * Transcribe audio.  Same signature as GroqSTT.transcribe().
   *
   * @param {Buffer} audioBuffer - WebM/WAV audio data
   * @param {string} language - Language code (e.g., 'en')
   * @param {string} mimeType - MIME type of the audio
   * @param {string} prompt - Whisper prompt (initial context)
   * @param {object} options - { translateToEnglish?: boolean }
   * @returns {Promise<{text: string, duration: number, apiLatency: number}>}
   */
  async transcribe(audioBuffer, language = 'en', mimeType = 'audio/webm', prompt = '', options = {}) {
    if (!this._ready) {
      throw new Error('Local STT not initialized. Download the model first.');
    }

    const startTime = Date.now();

    // Step 1: Convert audio to 16 kHz mono WAV (temp file)
    const tmpWav = path.join(os.tmpdir(), `volttype-${Date.now()}.wav`);
    try {
      await this._convertToWav(audioBuffer, mimeType, tmpWav);
      const wavSize = fs.statSync(tmpWav).size;
      const duration = Math.max(0, (wavSize - 44) / (16000 * 2)); // rough estimate from WAV size
      console.log(`[LOCAL-STT] WAV: ${Math.round(wavSize / 1024)}KB, ~${duration.toFixed(1)}s`);

      // Step 2: Run whisper.cpp on the WAV file
      const text = await this._runWhisper(tmpWav, language, prompt, options);
      const elapsed = Date.now() - startTime;

      console.log(`[LOCAL-STT] Result: "${text.slice(0, 100)}" (${elapsed}ms)`);

      return {
        text,
        duration,
        apiLatency: elapsed,
      };
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tmpWav); } catch {}
    }
  }

  /**
   * Convert audio buffer to 16 kHz mono WAV file using ffmpeg.
   */
  _convertToWav(audioBuffer, mimeType, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = this._findFfmpeg();
      if (!ffmpegPath) {
        return reject(new Error('ffmpeg not found'));
      }

      const args = [
        '-y',                    // overwrite output
        '-i', 'pipe:0',         // input from stdin
        '-ar', '16000',         // resample to 16 kHz
        '-ac', '1',             // mono
        '-acodec', 'pcm_s16le', // 16-bit PCM
        '-f', 'wav',            // WAV format
        outputPath,             // output to file
      ];

      const child = execFile(ffmpegPath, args, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'buffer',
        timeout: 30000,
      }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error('ffmpeg conversion failed: ' + (stderr?.toString().slice(-200) || error.message)));
        }
        resolve();
      });

      child.stdin.write(audioBuffer);
      child.stdin.end();
    });
  }

  /**
   * Run whisper.cpp CLI on a WAV file and return the transcribed text.
   */
  _runWhisper(wavPath, language, prompt, options) {
    return new Promise((resolve, reject) => {
      const task = options.translateToEnglish ? 'translate' : 'transcribe';
      const threads = Math.max(1, Math.min(4, os.cpus().length - 1));

      const args = [
        '-m', this._modelPath,      // model file
        '-f', wavPath,               // input WAV
        '-l', language || 'en',      // language
        '-t', String(threads),       // threads
        '--no-timestamps',           // don't include timestamps
        '-np',                       // no prints (suppress progress)
      ];

      // Add prompt if provided (initial context for better accuracy)
      if (prompt && prompt.length > 0) {
        args.push('--prompt', prompt);
      }

      // Translate mode
      if (task === 'translate') {
        args.push('--translate');
      }

      console.log(`[LOCAL-STT] Running: ${path.basename(this._whisperPath)} (${threads} threads, ${language})`);

      execFile(this._whisperPath, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000, // 2 minute timeout
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error) {
          // Check if it's just a timeout
          if (error.killed) {
            return reject(new Error('Whisper transcription timed out (>2 min)'));
          }
          return reject(new Error('Whisper failed: ' + (stderr?.toString().slice(-300) || error.message)));
        }

        // Parse whisper output — text lines, strip leading/trailing whitespace
        const text = (stdout || '')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          // Skip lines that look like whisper internal output
          .filter(line => !line.startsWith('whisper_') && !line.startsWith('main:') && !line.startsWith('system_info:'))
          .join(' ')
          .trim();

        resolve(text);
      });
    });
  }

  /**
   * Find ffmpeg binary — checks bundled location first, then PATH.
   */
  _findFfmpeg() {
    // 1. Check bundled ffmpeg (for production builds)
    const bundledPaths = [
      path.join(process.resourcesPath || '', 'ffmpeg.exe'),
      path.join(process.resourcesPath || '', 'ffmpeg'),
    ];
    for (const p of bundledPaths) {
      if (fs.existsSync(p)) return p;
    }

    // 2. Check node_modules (ffmpeg-static package)
    try {
      return require('ffmpeg-static');
    } catch {}

    // 3. Check PATH
    const ext = process.platform === 'win32' ? '.exe' : '';
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, 'ffmpeg' + ext);
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  /** Free resources. */
  destroy() {
    this._ready = false;
    this._modelPath = null;
    this._whisperPath = null;
  }
}

module.exports = LocalSTT;
