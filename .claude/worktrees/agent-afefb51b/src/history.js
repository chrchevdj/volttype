/**
 * Dictation history store.
 * Saves recent dictations to a local JSON file.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX_ENTRIES = 200;

class History {
  constructor() {
    this._path = path.join(app.getPath('userData'), 'history.json');
    this._entries = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        this._entries = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to load history:', e.message);
      this._entries = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._entries, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save history:', e.message);
    }
  }

  add(entry) {
    this._entries.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: entry.text,
      duration: entry.duration || 0,
      engine: entry.engine || 'unknown',
      language: entry.language || 'en',
      timestamp: new Date().toISOString(),
    });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(0, MAX_ENTRIES);
    }
    this._save();
  }

  getAll() {
    return [...this._entries];
  }

  getRecent(count = 20) {
    return this._entries.slice(0, count);
  }

  clear() {
    this._entries = [];
    this._save();
  }

  get(id) {
    return this._entries.find(e => e.id === id) || null;
  }

  update(id, newText) {
    const entry = this._entries.find(e => e.id === id);
    if (entry) {
      entry.originalText = entry.originalText || entry.text; // Preserve original on first edit
      entry.text = newText;
      entry.editedAt = new Date().toISOString();
      this._save();
    }
    return entry;
  }

  delete(id) {
    this._entries = this._entries.filter(e => e.id !== id);
    this._save();
  }
}

module.exports = History;
