const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  saveAvif: (pngBase64) => ipcRenderer.invoke('save-avif', pngBase64),
})