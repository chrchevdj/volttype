/**
 * Groq API proxy — forwards requests using the server-side API key.
 * The client never sees the Groq key.
 */

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Proxy audio transcription to Groq Whisper.
 */
export async function proxyTranscribe(request, env) {
  const contentType = request.headers.get('Content-Type');
  if (!contentType || !contentType.includes('multipart/form-data')) {
    return { error: 'Content-Type must be multipart/form-data', status: 400 };
  }

  // Forward the request body directly to Groq
  const groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': contentType,
    },
    body: request.body,
  });

  const data = await groqRes.json();

  if (!groqRes.ok) {
    return {
      error: data?.error?.message || `Groq API error ${groqRes.status}`,
      status: groqRes.status,
    };
  }

  return {
    text: data.text || '',
    duration: data.duration || 0,
    status: 200,
  };
}

/**
 * Proxy text cleanup to Groq LLM (Llama 3.3 70B).
 */
export async function proxyClean(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: 'Invalid JSON body', status: 400 };
  }

  const { text, outputStyle, userContext } = body;
  if (!text) {
    return { error: 'Missing "text" field', status: 400 };
  }

  const systemPrompt = getCleanerPrompt(outputStyle || 'punctuated', userContext || '');

  const groqRes = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  const data = await groqRes.json();

  if (!groqRes.ok) {
    return {
      error: data?.error?.message || `Groq API error ${groqRes.status}`,
      status: groqRes.status,
    };
  }

  return {
    cleaned: data.choices?.[0]?.message?.content?.trim() || text,
    status: 200,
  };
}

function getCleanerPrompt(style, userContext) {
  let prompt;
  if (style === 'punctuated') {
    prompt = `You are a dictation assistant. Fix only punctuation and capitalization.
Rules:
- Add proper punctuation (periods, commas, question marks)
- Fix capitalization (start of sentences, proper nouns)
- Do NOT change any words or sentence structure
- Output ONLY the corrected text, nothing else`;
  } else {
    prompt = `You are a dictation post-processor. Rewrite for clarity and flow while preserving every idea.
ABSOLUTE RULES:
1. PRESERVE EVERY IDEA the speaker expressed
2. NEVER ADD content the speaker did not say
3. NEVER CHANGE the speaker's perspective
4. NEVER CHANGE a question into a statement
5. NEVER INVENT conclusions the speaker did not state
WHAT YOU SHOULD DO:
- Rewrite for clarity, flow, and readability
- Fix grammar, punctuation, and capitalization
- Remove filler words (um, uh, like, you know)
- Keep technical terms and names exactly as spoken
OUTPUT: Only the rewritten text. No preamble, no markdown.`;
  }

  if (userContext) {
    prompt += `\n\nContext about this speaker:\n${userContext}`;
  }
  return prompt;
}
