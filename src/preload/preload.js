'use strict';

// Runs in a sandboxed, context-isolated preload. Exposes a minimal, fixed API:
// the renderer can never reach ipcRenderer or Node.js directly.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'vocabAPI',
  Object.freeze({
    loadProgress: () => ipcRenderer.invoke('progress:load'),
    saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
    getAppInfo: () => ipcRenderer.invoke('app:info')
  })
);
