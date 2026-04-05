/**
 * Snippets engine.
 * Saved reusable text blocks that can be quickly inserted.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Snippets {
  constructor() {
    this._path = path.join(app.getPath('userData'), 'snippets.json');
    this._items = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        this._items = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to load snippets:', e.message);
      this._items = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._items, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save snippets:', e.message);
    }
  }

  getAll() {
    return [...this._items];
  }

  add(name, text, category = 'general') {
    this._items.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      text,
      category,
      createdAt: new Date().toISOString(),
    });
    this._save();
  }

  update(id, updates) {
    const item = this._items.find(s => s.id === id);
    if (item) {
      Object.assign(item, updates);
      this._save();
    }
  }

  remove(id) {
    this._items = this._items.filter(s => s.id !== id);
    this._save();
  }

  get(id) {
    return this._items.find(s => s.id === id);
  }
}

module.exports = Snippets;
