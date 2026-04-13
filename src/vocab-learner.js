/**
 * Personal Vocabulary Learner
 *
 * Learns from every dictation to continuously improve accuracy.
 * Builds three things:
 *
 *  1. Word frequencies — tracks which words you use most
 *  2. Personal terms   — proper nouns, technical jargon, brand names
 *  3. Style profile    — your typical tone, sentence patterns
 *
 * This data is fed to:
 *  - Whisper (prompt parameter) → better speech recognition
 *  - LLM cleaner (system prompt context) → better corrections
 *
 * All data stored locally in %APPDATA%/volttype/vocab.json
 */
const fs = require('fs');
const path = require('path');
const { getApp } = require('./electron-runtime');
const app = getApp();

// Words to ignore when building vocabulary (too common to be useful)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'or', 'if', 'while', 'because', 'until', 'although',
  'that', 'this', 'these', 'those', 'it', 'its', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'about',
  'up', 'down', 'also', 'like', 'well', 'back', 'even', 'still',
  'get', 'got', 'go', 'going', 'went', 'come', 'came', 'make', 'made',
  'take', 'took', 'know', 'knew', 'think', 'thought', 'say', 'said',
  'see', 'saw', 'want', 'give', 'gave', 'tell', 'told', 'work',
  'call', 'try', 'ask', 'put', 'keep', 'let', 'begin', 'seem',
  'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe',
  'bring', 'happen', 'must', 'really', 'already', 'always', 'never',
  'much', 'many', 'right', 'new', 'old', 'good', 'great', 'little',
  'big', 'long', 'first', 'last', 'one', 'two', 'three', 'four', 'five',
  'thing', 'time', 'way', 'day', 'man', 'woman', 'people', 'yeah',
  'yes', 'okay', 'ok', 'sure', 'oh', 'ah', 'um', 'uh', 'don',
]);

class VocabLearner {
  constructor() {
    this._path = path.join(app.getPath('userData'), 'vocab.json');
    this._data = {
      wordFreq: {},        // word → count
      personalTerms: [],   // proper nouns, brands, jargon
      corrections: {},     // wrong → correct (learned from user edits)
      styleNotes: [],      // observed style patterns
      totalDictations: 0,
      totalCorrections: 0,
      lastUpdated: null,
    };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
        this._data = { ...this._data, ...raw };
      }
    } catch (e) {
      console.error('[VOCAB] Failed to load:', e.message);
    }
  }

  _save() {
    try {
      this._data.lastUpdated = new Date().toISOString();
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[VOCAB] Failed to save:', e.message);
    }
  }

  /**
   * Learn from a completed dictation.
   * Call this after every successful transcription.
   *
   * @param {string} rawText - Original Whisper output
   * @param {string} cleanedText - LLM-cleaned output (what was actually injected)
   */
  learn(rawText, cleanedText) {
    this._data.totalDictations++;

    // Extract and count meaningful words from the cleaned text
    const words = this._extractWords(cleanedText || rawText);
    for (const word of words) {
      const lower = word.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;
      if (lower.length < 3) continue;

      this._data.wordFreq[lower] = (this._data.wordFreq[lower] || 0) + 1;
    }

    // Detect personal terms (capitalized words that aren't sentence starters)
    this._detectPersonalTerms(cleanedText || rawText);

    // Analyze style patterns every 10 dictations
    if (this._data.totalDictations % 10 === 0) {
      this._analyzeStyle(cleanedText || rawText);
    }

    // Prune low-frequency words periodically (keep vocab lean)
    if (this._data.totalDictations % 50 === 0) {
      this._pruneVocab();
    }

    this._save();
    console.log(`[VOCAB] Learned from dictation #${this._data.totalDictations}. Vocab size: ${Object.keys(this._data.wordFreq).length}, Terms: ${this._data.personalTerms.length}`);
  }

  /**
   * Get a Whisper prompt string with the user's most common words.
   * This dramatically improves recognition of personal vocabulary.
   */
  getWhisperPrompt() {
    const topWords = this._getTopWords(30);
    const terms = this._data.personalTerms.slice(0, 20);
    // Include corrected words — these are the RIGHT spellings Whisper should use
    const correctedWords = Object.values(this._data.corrections || {}).slice(0, 15);

    const parts = [];
    if (terms.length > 0) {
      parts.push(terms.join(', '));
    }
    if (correctedWords.length > 0) {
      parts.push(correctedWords.join(', '));
    }
    if (topWords.length > 0) {
      parts.push(topWords.join(' '));
    }

    return parts.join('. ').slice(0, 400);
  }

  /**
   * Get context for the LLM cleaner about the user's style and vocabulary.
   */
  getCleanerContext() {
    const terms = this._data.personalTerms.slice(0, 30);
    const topWords = this._getTopWords(20);
    const style = this._data.styleNotes.slice(-3);
    const corrections = Object.entries(this._data.corrections || {}).slice(0, 20);

    const parts = [];

    if (terms.length > 0) {
      parts.push(`The speaker frequently uses these proper nouns and terms (preserve their exact spelling): ${terms.join(', ')}`);
    }

    if (corrections.length > 0) {
      const corrStr = corrections.map(([wrong, right]) => `"${wrong}" should be "${right}"`).join(', ');
      parts.push(`IMPORTANT — The speaker has corrected these words before. Always apply these corrections: ${corrStr}`);
    }

    if (topWords.length > 0) {
      parts.push(`Common vocabulary: ${topWords.join(', ')}`);
    }

    if (style.length > 0) {
      parts.push(`Style observations: ${style.join('. ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Learn from a user correction.
   * Compares original text with user-edited text and extracts word-level differences.
   * These corrections are fed to Whisper and the LLM cleaner to avoid repeating mistakes.
   *
   * @param {string} originalText - What the app produced
   * @param {string} correctedText - What the user changed it to
   */
  learnCorrection(originalText, correctedText) {
    if (!originalText || !correctedText) return;
    if (originalText.trim() === correctedText.trim()) return;

    const origWords = originalText.toLowerCase().split(/\s+/);
    const corrWords = correctedText.split(/\s+/);
    const corrWordsLower = corrWords.map(w => w.toLowerCase());

    // Find words that were changed (simple diff by position + fuzzy matching)
    // Strategy: find words in original that don't appear in corrected, and vice versa
    const origSet = new Set(origWords);
    const corrSet = new Set(corrWordsLower);

    // Words removed from original (the wrong ones)
    const removed = origWords.filter(w => !corrSet.has(w) && !STOP_WORDS.has(w) && w.length >= 3);
    // Words added in corrected (the right ones)
    const added = corrWords.filter(w => !origSet.has(w.toLowerCase()) && !STOP_WORDS.has(w.toLowerCase()) && w.length >= 3);

    // If there are clear 1:1 replacements, learn them
    if (removed.length > 0 && added.length > 0 && removed.length <= 3 && added.length <= 3) {
      // Pair them up (best effort)
      const pairs = Math.min(removed.length, added.length);
      for (let i = 0; i < pairs; i++) {
        const wrong = removed[i];
        const right = added[i];
        this._data.corrections[wrong] = right;
        console.log(`[VOCAB] Learned correction: "${wrong}" → "${right}"`);
      }
    }

    // Also learn any new capitalized words from the corrected text as personal terms
    this._detectPersonalTerms(correctedText);

    // Learn the corrected words into vocabulary
    const words = this._extractWords(correctedText);
    for (const word of words) {
      const lower = word.toLowerCase();
      if (STOP_WORDS.has(lower) || lower.length < 3) continue;
      this._data.wordFreq[lower] = (this._data.wordFreq[lower] || 0) + 2; // Weight corrections higher
    }

    this._data.totalCorrections++;
    this._save();
    console.log(`[VOCAB] Learned from correction #${this._data.totalCorrections}. Total corrections stored: ${Object.keys(this._data.corrections).length}`);
  }

  /**
   * Get all stored corrections.
   */
  getCorrections() {
    return { ...this._data.corrections };
  }

  /**
   * Manually add a personal term (name, brand, jargon).
   */
  addTerm(term) {
    if (!this._data.personalTerms.includes(term)) {
      this._data.personalTerms.push(term);
      this._save();
    }
  }

  /**
   * Remove a personal term.
   */
  removeTerm(term) {
    this._data.personalTerms = this._data.personalTerms.filter(t => t !== term);
    this._save();
  }

  /**
   * Get all personal terms.
   */
  getTerms() {
    return [...this._data.personalTerms];
  }

  /**
   * Get stats about the learner.
   */
  getStats() {
    return {
      totalDictations: this._data.totalDictations,
      totalCorrections: this._data.totalCorrections || 0,
      vocabSize: Object.keys(this._data.wordFreq).length,
      personalTerms: this._data.personalTerms.length,
      correctionsCount: Object.keys(this._data.corrections || {}).length,
      lastUpdated: this._data.lastUpdated,
    };
  }

  // --- Internal methods ---

  _extractWords(text) {
    return text.match(/[a-zA-ZÀ-ÿ''-]+/g) || [];
  }

  _detectPersonalTerms(text) {
    // Find capitalized words that appear mid-sentence (likely proper nouns)
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      // Skip first word (always capitalized)
      for (let i = 1; i < words.length; i++) {
        const word = words[i].replace(/[^a-zA-ZÀ-ÿ''-]/g, '');
        if (word.length >= 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
          // Capitalized mid-sentence = likely a proper noun
          if (!this._data.personalTerms.includes(word) && !STOP_WORDS.has(word.toLowerCase())) {
            this._data.personalTerms.push(word);
            console.log(`[VOCAB] New personal term: "${word}"`);
          }
        }
      }
    }

    // Cap personal terms at 100
    if (this._data.personalTerms.length > 100) {
      this._data.personalTerms = this._data.personalTerms.slice(-100);
    }
  }

  _analyzeStyle(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return;

    const avgWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;

    // Update style notes (keep only latest observations)
    if (avgWords < 8) {
      this._updateStyleNote('tone', 'Speaker tends to use short, direct sentences');
    } else if (avgWords > 20) {
      this._updateStyleNote('tone', 'Speaker uses longer, detailed sentences');
    } else {
      this._updateStyleNote('tone', 'Speaker uses moderate-length sentences');
    }

    // Check for question frequency
    const questions = text.split('?').length - 1;
    if (questions > sentences.length / 3) {
      this._updateStyleNote('questions', 'Speaker frequently asks questions');
    }

    // Cap style notes
    if (this._data.styleNotes.length > 10) {
      this._data.styleNotes = this._data.styleNotes.slice(-10);
    }
  }

  _updateStyleNote(category, note) {
    // Replace existing note in same category, or add new
    const prefix = category + ':';
    const idx = this._data.styleNotes.findIndex(n => n.startsWith(prefix));
    const tagged = prefix + ' ' + note;
    if (idx >= 0) {
      this._data.styleNotes[idx] = tagged;
    } else {
      this._data.styleNotes.push(tagged);
    }
  }

  _getTopWords(count) {
    return Object.entries(this._data.wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word]) => word);
  }

  _pruneVocab() {
    // Remove words used only once (likely noise)
    const before = Object.keys(this._data.wordFreq).length;
    for (const [word, count] of Object.entries(this._data.wordFreq)) {
      if (count <= 1) delete this._data.wordFreq[word];
    }
    const after = Object.keys(this._data.wordFreq).length;
    if (before !== after) {
      console.log(`[VOCAB] Pruned ${before - after} low-frequency words`);
    }
  }
}

module.exports = VocabLearner;
