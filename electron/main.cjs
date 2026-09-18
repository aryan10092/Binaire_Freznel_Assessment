const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')
const sharp = require('sharp')

function registerIpcHandlers() {
  ipcMain.handle('save-avif', async (_event, pngBase64) => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'panorama.avif',
      filters: [{ name: 'AVIF image', extensions: ['avif'] }],
    })

    if (result.canceled || !result.filePath) return false

    await sharp(Buffer.from(pngBase64, 'base64')).avif().toFile(result.filePath)
    return true
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})