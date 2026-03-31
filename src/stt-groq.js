/**
 * Speech-to-Text engine using Groq's Whisper API.
 * Free tier: whisper-large-v3, 20 req/min — perfect for personal dictation.
 */
const { net } = require('electron');

const WORKER_URL = 'https://volttype-api.crcaway.workers.dev';

class GroqSTT {
  constructor(apiKey) {
    this._apiKey = apiKey;
    this._authToken = null; // Supabase JWT for Worker proxy
  }

  setApiKey(key) {
    this._apiKey = key;
  }

  setAuthToken(token) {
    this._authToken = token;
  }

  /**
   * Transcribe audio buffer to text.
   * @param {Buffer} audioBuffer - WebM/WAV audio data
   * @param {string} language - Language code (e.g., 'en')
   * @param {string} mimeType - MIME type of the audio (e.g., 'audio/webm')
   * @returns {Promise<{text: string, duration: number}>}
   */
  async transcribe(audioBuffer, language = 'en', mimeType = 'audio/webm', prompt = '') {
    // Use Worker backend if user is logged in (no personal API key needed)
    if (this._authToken && !this._apiKey) {
      return this._transcribeViaWorker(audioBuffer, language, mimeType, prompt);
    }

    if (!this._apiKey && !this._authToken) {
      throw new Error('Please sign in or add your own API key in Settings.');
    }

    console.log('[GROQ] Starting transcription...', audioBuffer.length, 'bytes');

    const ext = mimeType.includes('webm') ? 'webm'
      : mimeType.includes('wav') ? 'wav'
      : mimeType.includes('mp3') ? 'mp3'
      : 'webm';

    // Build multipart form data
    const boundary = '----VoltTypeBoundary' + Date.now().toString(36);

    const formParts = [];

    // File part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    ));
    formParts.push(audioBuffer);
    formParts.push(Buffer.from('\r\n'));

    // Model part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-large-v3-turbo\r\n`
    ));

    // Language part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${language}\r\n`
    ));

    // Response format
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `verbose_json\r\n`
    ));

    // Prompt (guides Whisper for better accuracy)
    if (prompt) {
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${prompt}\r\n`
      ));
    }

    // Temperature
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="temperature"\r\n\r\n` +
      `0.0\r\n`
    ));

    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    const startTime = Date.now();

    try {
      // Use Electron's net module (handles proxies and certificates better)
      const response = await net.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      });

      const elapsed = Date.now() - startTime;
      const raw = await response.text();

      console.log('[GROQ] Response status:', response.status, 'latency:', elapsed + 'ms');

      if (!response.ok) {
        let msg = `Groq API error ${response.status}`;
        try { msg += ': ' + JSON.parse(raw).error?.message; } catch {}
        throw new Error(msg);
      }

      const data = JSON.parse(raw);
      console.log('[GROQ] Transcription:', data.text?.slice(0, 100));

      return {
        text: (data.text || '').trim(),
        duration: data.duration || 0,
        apiLatency: elapsed,
      };
    } catch (err) {
      console.error('[GROQ] Error:', err.message);
      throw err;
    }
  }

  /**
   * Transcribe via VoltType Worker backend (for logged-in users without their own key).
   */
  async _transcribeViaWorker(audioBuffer, language, mimeType, prompt) {
    console.log('[WORKER] Transcribing via backend...', audioBuffer.length, 'bytes');

    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('wav') ? 'wav' : 'webm';
    const boundary = '----VoltTypeBoundary' + Date.now().toString(36);

    const formParts = [];
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
    formParts.push(audioBuffer);
    formParts.push(Buffer.from('\r\n'));
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`));
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
    if (prompt) {
      formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`));
    }
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`));
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0\r\n`));
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);
    const startTime = Date.now();

    try {
      const response = await net.fetch(`${WORKER_URL}/v1/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._authToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      });

      const elapsed = Date.now() - startTime;
      const data = await response.json();

      console.log('[WORKER] Response status:', response.status, 'latency:', elapsed + 'ms');

      if (!response.ok) {
        throw new Error(data.error || `Worker API error ${response.status}`);
      }

      console.log('[WORKER] Transcription:', data.text?.slice(0, 100));

      return {
        text: (data.text || '').trim(),
        duration: data.duration || 0,
        apiLatency: elapsed,
      };
    } catch (err) {
      console.error('[WORKER] Error:', err.message);
      throw err;
    }
  }
}

module.exports = GroqSTT;
