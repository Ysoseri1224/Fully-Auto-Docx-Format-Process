const path = require('path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { buildFromMarkdown } = require('../src/core/build');
const { processReview } = require('../src/core/review');
const { buildOutputPath } = require('../src/cli');

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('writemaster:pick-file', async (_, { mode }) => {
  const filters = mode === 'md'
    ? [{ name: 'Markdown', extensions: ['md'] }]
    : [{ name: 'DOCX', extensions: ['docx'] }];
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('writemaster:run', async (_, payload) => {
  const { mode, inputPath, name, masterPath, pandocPath, backupMdPath } = payload;
  if (!inputPath) return { ok: false, error: 'Please choose an input file first.' };
  const outputPath = buildOutputPath(inputPath, mode, name, undefined);
  try {
    if (mode === 'md') {
      buildFromMarkdown({
        mdPath: inputPath,
        outputPath,
        masterPath,
        pandocPath,
        backupMdPath,
      });
    } else {
      processReview({
        inputPath,
        outputPath,
        masterPath,
        mdPath: backupMdPath,
      });
    }
    return { ok: true, outputPath };
  } catch (error) {
    return { ok: false, error: error.stack || error.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
