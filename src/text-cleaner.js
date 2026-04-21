/**
 * LLM-powered text cleaner for VoltType.
 *
 * Takes raw Whisper output and runs it through Groq's LLM to:
 *  - Fix grammar and punctuation
 *  - Make sentences flow naturally
 *  - Correct misheard words based on context
 *  - Remove filler words (um, uh, like)
 *  - Keep the speaker's intent and meaning intact
 *  - Detect and execute AI voice commands
 *
 * Uses Groq's free LLM API (same key as Whisper).
 */
const { getNet } = require('./electron-runtime');
const net = getNet();

// Voice command patterns — user says these to trigger AI processing
const VOICE_COMMANDS = [
  { pattern: /^(?:make (?:it |this )?)?(?:more )?formal$/i,          command: 'formal',      label: 'Making formal' },
  { pattern: /^(?:make (?:it |this )?)?(?:more )?professional$/i,    command: 'professional', label: 'Making professional' },
  { pattern: /^(?:make (?:it |this )?)?(?:more )?casual$/i,          command: 'casual',      label: 'Making casual' },
  { pattern: /^(?:make (?:it |this )?)?shorter$/i,                   command: 'shorter',     label: 'Making shorter' },
  { pattern: /^(?:make (?:it |this )?)?longer$/i,                    command: 'longer',      label: 'Making longer' },
  { pattern: /^(?:fix (?:the )?)?grammar$/i,                         command: 'grammar',     label: 'Fixing grammar' },
  { pattern: /^(?:fix (?:the )?)?spelling$/i,                        command: 'spelling',    label: 'Fixing spelling' },
  { pattern: /^summarize(?:\s+(?:it|this))?$/i,                      command: 'summarize',   label: 'Summarizing' },
  { pattern: /^(?:make (?:it |this )?)?(?:into )?(?:a )?bullet ?points?$/i, command: 'bullets', label: 'Converting to bullets' },
  { pattern: /^(?:make (?:it |this )?)?(?:into )?(?:a )?(?:numbered |ordered )?list$/i, command: 'list', label: 'Converting to list' },
  { pattern: /^translate (?:(?:it |this )?(?:to |into ))?(.+)$/i,    command: 'translate',   label: 'Translating' },
  { pattern: /^(?:rewrite|rephrase)(?: (?:it|this))?$/i,             command: 'rewrite',     label: 'Rewriting' },
  { pattern: /^(?:make (?:it |this )?)?(?:more )?friendly$/i,        command: 'friendly',    label: 'Making friendly' },
  { pattern: /^(?:make (?:it |this )?)?(?:more )?concise$/i,         command: 'concise',     label: 'Making concise' },
  { pattern: /^expand(?: on)?(?:\s+(?:it|this))?$/i,                 command: 'expand',      label: 'Expanding' },
];

class TextCleaner {
  constructor(apiKey) {
    this._apiKey = apiKey;
    this._model = 'llama-3.3-70b-versatile'; // Best quality on Groq free tier
  }

  setApiKey(key) {
    this._apiKey = key;
  }

  /**
   * Detect if transcribed text is a voice command.
   * @param {string} text - Transcribed text to check
   * @returns {{ isCommand: boolean, command: string|null, label: string|null, extra: string|null }}
   */
  detectCommand(text) {
    if (!text || text.trim().length === 0) return { isCommand: false };

    const trimmed = text.trim().replace(/[.!?,;:]+$/g, ''); // Strip trailing punctuation

    for (const vc of VOICE_COMMANDS) {
      const match = trimmed.match(vc.pattern);
      if (match) {
        return {
          isCommand: true,
          command: vc.command,
          label: vc.label,
          extra: match[1] ? match[1].trim() : null, // e.g. language name for translate
        };
      }
    }

    return { isCommand: false };
  }

  /**
   * Execute a voice command on the given text using LLM.
   * @param {string} command - Command name (e.g. 'formal', 'translate')
   * @param {string} targetText - The text to transform
   * @param {string} extra - Extra parameter (e.g. language for translate)
   * @returns {Promise<string>} Transformed text
   */
  async executeCommand(command, targetText, extra = '') {
    if (!targetText || targetText.trim().length === 0) return targetText;
    if (!this._apiKey) return targetText;

    const systemPrompt = this._getCommandPrompt(command, extra);
    if (!systemPrompt) return targetText;

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
            { role: 'user', content: targetText },
          ],
          temperature: 0,
          max_tokens: 2048,
        }),
      });

      const elapsed = Date.now() - startTime;
      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `HTTP ${response.status}`;
        console.error('[COMMAND] LLM error:', errMsg);
        return targetText;
      }

      const result = data.choices?.[0]?.message?.content?.trim();
      console.log(`[COMMAND] ${command} in ${elapsed}ms: "${targetText.slice(0, 40)}..." -> "${(result || '').slice(0, 40)}..."`);

      return result || targetText;
    } catch (err) {
      console.error('[COMMAND] Error:', err.message);
      return targetText;
    }
  }

  /**
   * Clean/correct raw transcription text using an LLM.
   * @param {string} rawText - Raw whisper transcription
   * @param {string} outputStyle - 'raw' | 'verbatim' | 'punctuated' | 'cleaned'
   * @param {string} userContext - Learned vocabulary/style context from VocabLearner
   * @returns {Promise<string>} Cleaned text
   */
  async clean(rawText, outputStyle = 'punctuated', userContext = '') {
    if (!rawText || rawText.trim().length === 0) return rawText;
    if (outputStyle === 'raw') return rawText;
    // Verbatim mode: bypass LLM entirely — deterministic local pass only.
    if (outputStyle === 'verbatim') return this._verbatimPass(rawText);
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

      if (!cleaned) return rawText;

      // Safety net: if the LLM diverged too far from the input (paraphrase / context drift),
      // fall back to the raw text. This catches the "cleaned mode mangles my words" bug.
      // Only applied to 'cleaned' style — 'punctuated' can still legitimately reflow.
      if (outputStyle === 'cleaned' && this._wordDivergenceRatio(rawText, cleaned) > 0.10) {
        console.warn('[CLEANER] Divergence >10% — returning raw to preserve meaning');
        return rawText;
      }

      return cleaned;
    } catch (err) {
      console.error('[CLEANER] Error:', err.message);
      return rawText; // Never fail — always return something
    }
  }

  _getCommandPrompt(command, extra) {
    const prompts = {
      formal: `Rewrite the following text in a formal, professional tone. Keep all the original ideas and meaning. Output ONLY the rewritten text, nothing else.`,
      professional: `Rewrite the following text to sound professional and polished, suitable for business communication. Keep all original ideas. Output ONLY the rewritten text.`,
      casual: `Rewrite the following text in a casual, friendly tone. Keep all the original ideas. Output ONLY the rewritten text.`,
      friendly: `Rewrite the following text in a warm, friendly tone. Keep all the original ideas. Output ONLY the rewritten text.`,
      shorter: `Make the following text significantly shorter while keeping all key points. Be concise. Output ONLY the shortened text.`,
      longer: `Expand the following text with more detail and explanation while keeping the same meaning. Output ONLY the expanded text.`,
      grammar: `Fix all grammar and spelling errors in the following text. Do not change the meaning or tone. Output ONLY the corrected text.`,
      spelling: `Fix all spelling errors in the following text. Do not change anything else. Output ONLY the corrected text.`,
      summarize: `Summarize the following text in 1-3 concise sentences. Output ONLY the summary.`,
      bullets: `Convert the following text into clear, concise bullet points. Output ONLY the bullet points, one per line, starting each with "- ".`,
      list: `Convert the following text into a numbered list. Output ONLY the numbered items, one per line.`,
      rewrite: `Rewrite the following text to be clearer and better-structured while preserving the exact same meaning. Output ONLY the rewritten text.`,
      concise: `Make the following text more concise without losing any important information. Output ONLY the concise version.`,
      expand: `Expand on the following text, adding more detail and context while keeping the same meaning and direction. Output ONLY the expanded text.`,
      translate: extra
        ? `Translate the following text into ${extra}. Output ONLY the translation, nothing else.`
        : null,
      // AI Notes workspace commands
      summarize_notes: `Summarize the following text into 3-5 concise bullet points capturing the key information. Start each bullet with "\u2022 ". Output ONLY the bullet points.`,
      action_items: `Extract all action items, to-do tasks, and commitments from the following text. Format as a numbered list starting each with a checkbox "\u2610". If no clear actions exist, suggest 3 logical next steps. Output ONLY the list.`,
      follow_ups: `Based on the following text, generate 3-5 follow-up questions or tasks that would be logical next steps. Format as a numbered list. Output ONLY the list.`,
      meeting_notes: `Format the following raw text as structured meeting notes with these sections:\n\nKey Points:\nDecisions Made:\nAction Items:\nNext Steps:\n\nExtract information from the text to fill each section. Output ONLY the formatted notes.`,
      email_draft: `Turn the following rough text into a polished, professional email. Start with "Subject:" line, then the email body. Keep the original intent. Output ONLY the email.`,
    };

    return prompts[command] || null;
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

    // 'cleaned' — minimal-touch correction. Fix obvious transcription errors only.
    return `PRIMARY DIRECTIVE: Fix only obvious transcription errors. Do NOT rephrase.

Your job is to lightly correct a speech-to-text transcript. The speaker's exact words matter. Treat the input as near-final — only touch what is clearly wrong.

BANNED ACTIONS — never do any of these:
- Do NOT rephrase or "polish" sentences
- Do NOT change word order
- Do NOT substitute synonyms (keep "big" as "big", do not change it to "large")
- Do NOT reorder sentences or ideas
- Do NOT summarize, condense, or expand
- Do NOT change a question into a statement or vice versa
- Do NOT change the speaker's perspective, pronouns, or who is doing what
- Do NOT invent content, conclusions, recommendations, or next steps
- Do NOT convert lists into prose or prose into lists

ALLOWED ACTIONS — only these:
- Fix a clearly misheard word when context makes the correct word obvious (e.g. "their" vs "there")
- Fix punctuation (periods, commas, question marks) and capitalization
- Remove pure filler words only when they are clearly fillers: "um", "uh", "erm"
- Keep technical terms, names, and brand names exactly as transcribed

VERIFICATION RULE (critical):
Before returning your output, compare it word-for-word to the input.
If more than 10% of the words are different, you are rephrasing — STOP and return the input unchanged.

OUTPUT: Only the corrected text. No preamble, no quotes, no markdown, no explanations.`;
  }

  /**
   * Verbatim pass — no LLM. Deterministic local cleanup only.
   * Capitalizes the first letter, ensures a terminal punctuation mark,
   * and normalizes whitespace. Preserves every word as transcribed.
   */
  _verbatimPass(rawText) {
    if (!rawText) return rawText;
    let t = rawText.replace(/\s+/g, ' ').trim();
    if (!t) return t;
    // Capitalize first alphabetic character
    t = t.replace(/^(\W*)([a-z])/, (_m, pre, ch) => pre + ch.toUpperCase());
    // Ensure terminal punctuation
    if (!/[.!?]$/.test(t)) t += '.';
    return t;
  }

  /**
   * Ratio of words in `cleaned` that don't appear in `raw` (case-insensitive,
   * stripped of punctuation). Used as a safety net against LLM paraphrasing.
   * Returns a value in [0, 1]. Higher = more divergence.
   */
  _wordDivergenceRatio(raw, cleaned) {
    const norm = (s) => (s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const rawWords = norm(raw);
    const cleanedWords = norm(cleaned);
    if (cleanedWords.length === 0) return 0;
    const rawSet = new Set(rawWords);
    let missing = 0;
    for (const w of cleanedWords) {
      if (!rawSet.has(w)) missing++;
    }
    return missing / cleanedWords.length;
  }
}

module.exports = TextCleaner;
