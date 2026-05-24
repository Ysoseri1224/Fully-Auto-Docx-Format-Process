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

ipcMain.handle('writemaster:check-pandoc', async (_, { explicitPath }) => {
  const { isPandocAvailable } = require('../src/core/pandoc');
  return isPandocAvailable(explicitPath || undefined);
});

ipcMain.handle('writemaster:install-pandoc', async () => {
  try {
    const { downloadPandoc } = require('../src/core/pandoc');
    const pandocPath = await downloadPandoc();
    return { ok: true, path: pandocPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// --- Review feature IPC ---

ipcMain.handle('writemaster:review-pick-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['md', 'docx'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  return { filePath, fileType: ext === '.md' ? 'md' : 'docx' };
});

ipcMain.handle('writemaster:review-read-file', async (_, { filePath, fileType }) => {
  try {
    if (fileType === 'md') {
      const content = fs.readFileSync(filePath, 'utf8');
      return { ok: true, content, blocks: null };
    }
    const { extractBlocks } = require('../src/core/extract');
    const result = extractBlocks(filePath);
    const plainText = (result.blocks || [])
      .filter((b) => b.text)
      .map((b) => b.text)
      .join('\n');
    return { ok: true, content: plainText, blocks: result.blocks };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('writemaster:review-read-ccswitch', async () => {
  const { readCCSwitchConfig } = require('../src/core/cc-switch');
  return readCCSwitchConfig();
});

ipcMain.handle('writemaster:review-load-skills', async () => {
  const skillsDir = path.join(__dirname, '..', 'ContRev');
  if (!fs.existsSync(skillsDir)) return [];
  const skills = [];
  for (const dir of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const raw = fs.readFileSync(skillPath, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const meta = {};
    if (match) {
      for (const line of match[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    skills.push({ id: dir, name: meta.name || dir, description: meta.description || '' });
  }
  return skills;
});

ipcMain.handle('writemaster:review-load-skill-content', async (_, { skillId }) => {
  const skillDir = path.join(__dirname, '..', 'ContRev', skillId);
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return { ok: false, error: 'Skill not found' };
  let content = fs.readFileSync(skillPath, 'utf8');
  const refsDir = path.join(skillDir, 'references');
  if (fs.existsSync(refsDir)) {
    const walk = (dir) => {
      let files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files = files.concat(walk(full));
        else if (entry.name.endsWith('.md')) files.push(full);
      }
      return files;
    };
    for (const refFile of walk(refsDir)) {
      const rel = path.relative(skillDir, refFile);
      content += `\n\n---\n## Reference: ${rel}\n\n${fs.readFileSync(refFile, 'utf8')}`;
    }
  }
  return { ok: true, content };
});

let activeReviewReq = null;

ipcMain.handle('writemaster:review-start', async (event, { apiKey, baseUrl, model, skillContent, documentContent }) => {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  const win = BrowserWindow.fromWebContents(event.sender);

  const body = JSON.stringify({
    model: model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    stream: true,
    system: skillContent,
    messages: [{ role: 'user', content: `请审阅以下文稿并生成详细的审阅报告（markdown 格式）：\n\n${documentContent}` }],
  });

  const url = new URL(baseUrl.replace(/\/$/, '') + '/v1/messages');
  const isHttps = url.protocol === 'https:';
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  const transport = isHttps ? https : http;
  const req = transport.request(options, (res) => {
    if (res.statusCode !== 200) {
      let errBody = '';
      res.on('data', (c) => { errBody += c; });
      res.on('end', () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('writemaster:review-stream-error', `HTTP ${res.statusCode}: ${errBody.slice(0, 200)}`);
        }
      });
      return;
    }
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          if (win && !win.isDestroyed()) win.webContents.send('writemaster:review-stream-done');
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            if (win && !win.isDestroyed()) win.webContents.send('writemaster:review-stream-chunk', parsed.delta.text);
          }
          if (parsed.type === 'message_stop') {
            if (win && !win.isDestroyed()) win.webContents.send('writemaster:review-stream-done');
          }
        } catch (e) {}
      }
    });
    res.on('end', () => {
      if (win && !win.isDestroyed()) win.webContents.send('writemaster:review-stream-done');
    });
  });

  req.on('error', (err) => {
    if (win && !win.isDestroyed()) win.webContents.send('writemaster:review-stream-error', err.message);
  });

  activeReviewReq = req;
  req.write(body);
  req.end();
  return { ok: true };
});

ipcMain.handle('writemaster:review-stop', async () => {
  if (activeReviewReq) {
    activeReviewReq.destroy();
    activeReviewReq = null;
  }
  return { ok: true };
});

ipcMain.handle('writemaster:review-save-report', async (_, content) => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'review-report.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.writeFileSync(result.filePath, content, 'utf8');
  return { ok: true, filePath: result.filePath };
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
