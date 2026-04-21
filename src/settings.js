/**
 * Settings persistence manager.
 * Stores settings as JSON in the app's userData directory.
 */
const fs = require('fs');
const path = require('path');
const { getApp } = require('./electron-runtime');
const app = getApp();

const SCHEMA_VERSION = 3;

const DEFAULTS = {
  version: SCHEMA_VERSION,
  hotkey: 'Ctrl+Shift+D',
  microphone: 'default',
  language: 'en',
  engine: 'groq',          // 'groq' | 'local'
  groqApiKey: '',
  localModelVariant: 'base.en',  // 'base.en' | 'small'
  localModelPath: '',       // path to whisper.cpp model file
  startMinimized: false,
  startWithWindows: false,
  injectionMode: 'clipboard', // 'clipboard' | 'typing'
  showOverlay: true,
  playSounds: true,
  outputStyle: 'punctuated',  // 'raw' | 'verbatim' | 'punctuated' | 'cleaned'
  translateToEnglish: false,  // when true, dictation in any language is typed in English
  applyLearnedVocab: false,   // inject vocab-learner userContext into cleaner prompt (off = no bias)
  theme: 'dark',
};

class Settings {
  constructor() {
    this._path = path.join(app.getPath('userData'), 'settings.json');
    this._data = { ...DEFAULTS };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
        // Merge with defaults to pick up new keys
        this._data = { ...DEFAULTS, ...raw, version: SCHEMA_VERSION };
        // Migrate v2 → v3: switch from cleaned to punctuated (cleaned changes meaning)
        if ((raw.version || 0) < 3 && raw.outputStyle === 'cleaned') {
          this._data.outputStyle = 'punctuated';
          this.save();
        }
      } else {
        // First run: try to auto-detect Groq API key from .env.master
        this._autoDetectGroqKey();
      }
    } catch (e) {
      console.error('Failed to load settings, using defaults:', e.message);
      this._data = { ...DEFAULTS };
    }
  }

  _autoDetectGroqKey() {
    // Check known locations for existing Groq API key
    const envMasterPaths = [
      path.join(__dirname, '..', '..', '.env.master'),           // Freelancing root
      path.join(process.env.USERPROFILE || '', 'Desktop', 'Freelancing', '.env.master'),
    ];
    for (const envPath of envMasterPaths) {
      try {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf-8');
          const match = content.match(/GROQ_API_KEY=(.+)/);
          if (match && match[1].trim().startsWith('gsk_')) {
            this._data.groqApiKey = match[1].trim();
            console.log('Auto-detected Groq API key from .env.master');
            this.save();
            break;
          }
        }
      } catch {}
    }
  }

  save() {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save settings:', e.message);
    }
  }

  get(key) {
    return this._data[key] ?? DEFAULTS[key];
  }

  set(key, value) {
    this._data[key] = value;
    this.save();
  }

  getAll() {
    return { ...this._data };
  }

  update(partial) {
    Object.assign(this._data, partial);
    this.save();
  }

  getPath() {
    return this._path;
  }
}

module.exports = Settings;
