/**
 * Preload script — exposes safe IPC bridge to renderer.
 * Uses contextBridge for security (no nodeIntegration needed).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('volttype', {
  // Recording
  onRecordingState: (callback) => ipcRenderer.on('recording-state', (_, data) => callback(data)),
  sendAudioCaptured: (data) => ipcRenderer.invoke('audio-captured', data),
  getRecordingState: () => ipcRenderer.invoke('get-recording-state'),
  vadAutoStop: () => ipcRenderer.send('vad-auto-stop'),

  // Transcription results
  onTranscriptionResult: (callback) => ipcRenderer.on('transcription-result', (_, data) => callback(data)),
  onTranscriptionError: (callback) => ipcRenderer.on('transcription-error', (_, data) => callback(data)),

  // Navigation
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, page) => callback(page)),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),

  // History
  getHistory: (count) => ipcRenderer.invoke('get-history', count),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryEntry: (id) => ipcRenderer.invoke('delete-history-entry', id),
  editHistoryEntry: (data) => ipcRenderer.invoke('edit-history-entry', data),

  // Vocabulary learner
  getVocabStats: () => ipcRenderer.invoke('get-vocab-stats'),
  getVocabTerms: () => ipcRenderer.invoke('get-vocab-terms'),
  addVocabTerm: (term) => ipcRenderer.invoke('add-vocab-term', term),
  removeVocabTerm: (term) => ipcRenderer.invoke('remove-vocab-term', term),

  // Dictionary
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addDictionaryRule: (data) => ipcRenderer.invoke('add-dictionary-rule', data),
  updateDictionaryRule: (data) => ipcRenderer.invoke('update-dictionary-rule', data),
  removeDictionaryRule: (index) => ipcRenderer.invoke('remove-dictionary-rule', index),

  // Snippets
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  addSnippet: (data) => ipcRenderer.invoke('add-snippet', data),
  updateSnippet: (data) => ipcRenderer.invoke('update-snippet', data),
  removeSnippet: (id) => ipcRenderer.invoke('remove-snippet', id),
  injectSnippet: (id) => ipcRenderer.invoke('inject-snippet', id),
  aiTransform: (data) => ipcRenderer.invoke('ai-transform', data),
  correctAndReinject: (data) => ipcRenderer.invoke('correct-and-reinject', data),

  // Upgrade / checkout
  checkout: (plan) => ipcRenderer.invoke('checkout', plan),
  getUsage: () => ipcRenderer.invoke('get-usage'),

  // Auth
  login: (data) => ipcRenderer.invoke('auth-login', data),
  signup: (data) => ipcRenderer.invoke('auth-signup', data),
  logout: () => ipcRenderer.invoke('auth-logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth-status'),
  getAuthToken: () => ipcRenderer.invoke('auth-token'),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Auto-updater
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, data) => callback(data)),
  installUpdate: () => ipcRenderer.send('install-update'),
});
