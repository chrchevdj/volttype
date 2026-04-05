/**
 * LLM-powered text cleaner for VoltType.
 *
 * Takes raw Whisper output and runs it through Groq's LLM to:
 *  - Fix grammar and punctuation
 *  - Make sentences flow naturally
 *  - Correct misheard words based on context
 *  - Remove filler words (um, uh, like)
 *  - Keep the speaker's intent and meaning intact
 *
 * Uses Groq's free LLM API (same key as Whisper).
 */
const { net } = require('electron');

class TextCleaner {
  constructor(apiKey) {
    this._apiKey = apiKey;
    this._model = 'llama-3.3-70b-versatile'; // Best quality on Groq free tier
  }

  setApiKey(key) {
    this._apiKey = key;
  }

  /**
   * Clean/correct raw transcription text using an LLM.
   * @param {string} rawText - Raw whisper transcription
   * @param {string} outputStyle - 'raw' (no processing), 'punctuated' (just fix punctuation), 'cleaned' (full rewrite)
   * @param {string} userContext - Learned vocabulary/style context from VocabLearner
   * @returns {Promise<string>} Cleaned text
   */
  async clean(rawText, outputStyle = 'cleaned', userContext = '') {
    if (!rawText || rawText.trim().length === 0) return rawText;
    if (outputStyle === 'raw') return rawText;
    if (!this._apiKey) return rawText; // No key = skip silently

    let systemPrompt = this._getSystemPrompt(outputStyle);

    // Append learned user context if available
    if (userContext) {
      systemPrompt += `\n\nContext about this speaker:\n${userContext}`;
    }

    try {
      const startTime = Date.now();

      const response = await net.fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText },
          ],
          temperature: 0,
          max_tokens: 2048,
        }),
      });

      const elapsed = Date.now() - startTime;
      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `HTTP ${response.status}`;
        console.error('[CLEANER] LLM error:', errMsg);
        return rawText; // Fallback to raw text on error
      }

      const cleaned = data.choices?.[0]?.message?.content?.trim();
      console.log(`[CLEANER] ${outputStyle} in ${elapsed}ms: "${rawText.slice(0, 50)}" → "${(cleaned || '').slice(0, 50)}"`);

      return cleaned || rawText;
    } catch (err) {
      console.error('[CLEANER] Error:', err.message);
      return rawText; // Never fail — always return something
    }
  }

  _getSystemPrompt(style) {
    if (style === 'punctuated') {
      return `You are a dictation assistant. Your only job is to fix punctuation and capitalization in the transcribed text.

Rules:
- Add proper punctuation (periods, commas, question marks)
- Fix capitalization (start of sentences, proper nouns)
- Do NOT change any words or sentence structure
- Do NOT add or remove words
- Output ONLY the corrected text, nothing else
- No explanations, no quotes, no markdown`;
    }

    // 'cleaned' — polished rewrite that preserves meaning exactly
    return `You are a dictation post-processor. You take messy spoken text and rewrite it to sound clear, polished, and well-structured — like a professional wrote it.

YOU MUST REWRITE THE TEXT TO SOUND BETTER. Make it flow, improve sentence structure, and make it read like polished written text.

HOWEVER — THESE RULES ARE ABSOLUTE:
1. PRESERVE EVERY SINGLE IDEA AND POINT the speaker made — do not drop, skip, or summarize any part
2. NEVER ADD ideas, facts, details, steps, or content the speaker did not say
3. NEVER CHANGE THE SPEAKER'S PERSPECTIVE — if they say "I want X", keep it as "I want X". Do NOT turn it into instructions addressed to someone else.
4. NEVER CHANGE a question into a statement. "Does this matter?" must stay a question.
5. NEVER INVENT conclusions, recommendations, or next steps the speaker did not state
6. NEVER CHANGE who is doing what — if the speaker says "the AI should do it", do not change it to "I will do it" or "you need to do it"

WHAT YOU SHOULD DO:
- Rewrite for clarity, flow, and readability
- Fix grammar, punctuation, and capitalization
- Remove filler words (um, uh, like, you know, basically)
- Restructure sentences to read better — but keep the same ideas in the same order
- Make it sound professional and well-written
- Keep technical terms, names, and brand names exactly as spoken

EXAMPLE:
- Speaker says: "I want to tell the AI to create a separate tab where I would be a super user and I provide a URL or specify what I want and the AI would tell me what I need to connect how I need to connect and it would be in charge of my social media for that URL"
  CORRECT output: "I want the AI to create a separate tab where I act as a super user. In this tab, I would provide a URL or specify what I want, and the AI would tell me what I need to connect, how to connect it, and then take charge of managing my social media for that URL."
  WRONG output: "To set this up, I'll need you to provide me with the URLs of the businesses..." (this invents content and changes the perspective)

OUTPUT: Only the rewritten text. No preamble, no quotes, no markdown, no explanations.`;
  }
}

module.exports = TextCleaner;
