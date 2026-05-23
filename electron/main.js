const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { buildFromMarkdown } = require('../src/core/build');
const { processReview, listBuiltInMasters } = require('../src/core/review');
const { buildOutputPath } = require('../src/cli');

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    icon: path.join(__dirname, '..', 'icon', 'logo.png'),
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

ipcMain.handle('writemaster:pick-master-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Word Documents', extensions: ['docx', 'doc'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('writemaster:list-masters', async () => {
  return listBuiltInMasters();
});

ipcMain.handle('writemaster:run', async (_, payload) => {
  const { mode, inputPath, name, masterId, customMasterPath, pandocPath, backupMdPath } = payload;
  if (!inputPath) return { ok: false, error: 'Please choose an input file first.' };
  const outputPath = buildOutputPath(inputPath, mode, name, undefined);
  try {
    if (mode === 'md') {
      buildFromMarkdown({
        mdPath: inputPath,
        outputPath,
        masterId,
        customMasterPath,
        masterPath: customMasterPath,
        pandocPath,
        backupMdPath,
      });
    } else {
      processReview({
        inputPath,
        outputPath,
        masterId,
        customMasterPath,
        masterPath: customMasterPath,
        mdPath: backupMdPath,
      });
    }
    return { ok: true, outputPath };
  } catch (error) {
    return { ok: false, error: error.stack || error.message };
  }
});

// --- Extraction & Profile IPC ---

ipcMain.handle('writemaster:extract-master', async (_, { filePath }) => {
  try {
    const { extractBlocks, extractStylesSummary } = require('../src/core/extract');
    const { loadDocx, resolveMasterPath } = require('../src/core/review');
    const resolved = resolveMasterPath(filePath);
    const { blocks, documentSectPr, headersFooters } = extractBlocks(resolved);
    const styleList = extractStylesSummary(loadDocx(resolved));
    return { ok: true, blocks, styleList, documentSectPr, headersFooters };
  } catch (error) {
    return { ok: false, error: error.message, blocks: [], styleList: [], documentSectPr: null, headersFooters: null };
  }
});

ipcMain.handle('writemaster:save-profile', async (_, { profile }) => {
  try {
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    const filePath = path.join(profilesDir, `${profile.profileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
    return { ok: true, profilePath: filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:load-profiles', async () => {
  try {
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    if (!fs.existsSync(profilesDir)) return { ok: true, profiles: [] };
    const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    const profiles = files.map(f => {
      const raw = fs.readFileSync(path.join(profilesDir, f), 'utf8');
      return JSON.parse(raw);
    });
    return { ok: true, profiles };
  } catch (error) {
    return { ok: false, error: error.message, profiles: [] };
  }
});

ipcMain.handle('writemaster:delete-profile', async (_, { profileName }) => {
  try {
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    const filePath = path.join(profilesDir, `${profileName}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:pick-profile-file', async (_, { mode }) => {
  if (mode === 'import') {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON Profile', extensions: ['json'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  } else {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'JSON Profile', extensions: ['json'] }],
    });
    return result.canceled ? null : result.filePath;
  }
});

ipcMain.handle('writemaster:import-profile', async (_, { filePath: importPath }) => {
  try {
    const raw = fs.readFileSync(importPath, 'utf8');
    const profile = JSON.parse(raw);
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(path.join(profilesDir, `${profile.profileName}.json`), raw);
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:export-profile', async (_, { profileName, filePath: exportPath }) => {
  try {
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    const src = path.join(profilesDir, `${profileName}.json`);
    fs.copyFileSync(src, exportPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:cluster-blocks', async (_, { blocks }) => {
  try {
    const { clusterBlocks } = require('../src/core/extract');
    return { ok: true, tempStyles: clusterBlocks(blocks) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:generate-profile', async (_, { blocks, blockRoles, styleList, profileName, sourceTemplate }) => {
  try {
    const { generateProfile } = require('../src/core/extract');
    const profile = generateProfile(blocks, blockRoles, styleList, profileName, sourceTemplate);
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:run-with-profile', async (_, payload) => {
  const { mode, inputPath, name, masterId, customMasterPath, pandocPath, backupMdPath, profileName } = payload;

  // Load the profile
  let profile = null;
  if (profileName) {
    const profilesDir = path.join(app.getPath('userData'), 'profiles');
    const profilePath = path.join(profilesDir, `${profileName}.json`);
    if (fs.existsSync(profilePath)) {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }
  }

  if (!inputPath) return { ok: false, error: 'Please choose an input file first.' };
  const outputPath = buildOutputPath(inputPath, mode, name, undefined);
  try {
    if (mode === 'md') {
      buildFromMarkdown({
        mdPath: inputPath,
        outputPath,
        masterId,
        customMasterPath,
        masterPath: customMasterPath,
        pandocPath,
        backupMdPath,
        profile,
      });
    } else {
      processReview({
        inputPath,
        outputPath,
        masterId,
        customMasterPath,
        masterPath: customMasterPath,
        mdPath: backupMdPath,
        profile,
      });
    }
    return { ok: true, outputPath };
  } catch (error) {
    return { ok: false, error: error.stack || error.message };
  }
});

ipcMain.handle('writemaster:save-temp-styles', async (_, { styles }) => {
  try {
    const dir = path.join(app.getPath('userData'), 'temp-styles');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'saved.json'), JSON.stringify(styles, null, 2));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:load-temp-styles', async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'temp-styles', 'saved.json');
    if (!fs.existsSync(filePath)) return { ok: true, styles: [] };
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ok: true, styles: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error.message, styles: [] };
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
