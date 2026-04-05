/**
 * Dictionary / replacements engine.
 * Applies text corrections and custom replacements after transcription.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Dictionary {
  constructor() {
    this._path = path.join(app.getPath('userData'), 'dictionary.json');
    this._rules = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        this._rules = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
      } else {
        // Seed with useful defaults
        this._rules = [
          { from: 'period', to: '.', type: 'punctuation', enabled: true },
          { from: 'comma', to: ',', type: 'punctuation', enabled: true },
          { from: 'question mark', to: '?', type: 'punctuation', enabled: true },
          { from: 'exclamation mark', to: '!', type: 'punctuation', enabled: true },
          { from: 'new line', to: '\n', type: 'command', enabled: true },
          { from: 'new paragraph', to: '\n\n', type: 'command', enabled: true },
        ];
        this._save();
      }
    } catch (e) {
      console.error('Failed to load dictionary:', e.message);
      this._rules = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._rules, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save dictionary:', e.message);
    }
  }

  apply(text) {
    let result = text;
    for (const rule of this._rules) {
      if (!rule.enabled) continue;
      // Case-insensitive whole-word replacement
      const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(regex, rule.to);
    }
    return result;
  }

  getAll() {
    return [...this._rules];
  }

  add(from, to, type = 'custom') {
    this._rules.push({ from, to, type, enabled: true });
    this._save();
  }

  update(index, updates) {
    if (index >= 0 && index < this._rules.length) {
      Object.assign(this._rules[index], updates);
      this._save();
    }
  }

  remove(index) {
    if (index >= 0 && index < this._rules.length) {
      this._rules.splice(index, 1);
      this._save();
    }
  }

  setAll(rules) {
    this._rules = rules;
    this._save();
  }
}

module.exports = Dictionary;
