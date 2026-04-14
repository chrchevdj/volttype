/**
 * VoltType — API Service
 *
 * Communicates with the Cloudflare Worker backend at
 * https://volttype-api.crcaway.workers.dev/v1/
 */

import { getToken } from './auth';

const API_BASE = 'https://volttype-api.crcaway.workers.dev/v1';

/**
 * Helper — makes an authenticated request.
 */
async function authFetch(path, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

/**
 * POST /v1/transcribe
 *
 * Sends an audio file (URI) to the transcription endpoint.
 * @param {string} fileUri  — local file URI from expo-av recording
 * @param {string} language — ISO language code (default "en")
 * @returns {{ text: string, duration: number, usage: object }}
 */
export async function transcribe(fileUri, language = 'en', options = {}) {
  const { translateToEnglish = false } = options;
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  });
  if (translateToEnglish) {
    // Whisper's native translate task: any language → English
    formData.append('task', 'translate');
    formData.append('model', 'whisper-large-v3');
  } else {
    formData.append('model', 'whisper-large-v3-turbo');
    // Omit language → Whisper auto-detects (supports all 99 languages)
    if (language && language !== 'auto') {
      formData.append('language', language);
    }
  }
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0.0');

  const res = await authFetch('/transcribe', {
    method: 'POST',
    body: formData,
    // Let fetch set the multipart Content-Type with boundary
  });

  const data = await res.json();

  if (res.status === 429) {
    throw new Error('LIMIT_REACHED');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Transcription failed');
  }

  return data;
}

/**
 * POST /v1/clean
 *
 * Sends raw text for LLM cleanup (punctuation, grammar, formatting).
 * @param {string} text  — raw transcribed text
 * @param {string} style — output style: "clean", "formal", "bullet_points"
 * @returns {{ text: string }}
 */
export async function cleanText(text, style = 'clean') {
  const res = await authFetch('/clean', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, style }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Cleanup failed');
  }
  return data;
}

/**
 * GET /v1/usage
 *
 * Returns the user's current usage stats for the day.
 * @returns {{ plan, usedSeconds, limitSeconds, remainingSeconds }}
 */
export async function getUsage() {
  const res = await authFetch('/usage');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch usage');
  }
  return data;
}
