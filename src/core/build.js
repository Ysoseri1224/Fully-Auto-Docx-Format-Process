const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { processReview, resolveMasterPath } = require('./review');

function resolvePandocPath(explicitPath) {
  if (explicitPath) return explicitPath;
  if (process.env.WRITEMASTER_PANDOC) return process.env.WRITEMASTER_PANDOC;
  const windowsPandoc = 'D:\\Pandoc\\pandoc.exe';
  if (fs.existsSync(windowsPandoc)) return windowsPandoc;
  return 'pandoc';
}

function defaultBackupMdPath(mdPath) {
  const dir = path.dirname(mdPath);
  const base = path.basename(mdPath);
  return path.join(dir, 'md_backups_before_sync', base);
}

function createTempDocxPath(mdPath) {
  const base = path.basename(mdPath, path.extname(mdPath));
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return path.join(os.tmpdir(), `${base}-${nonce}.docx`);
}

function buildFromMarkdown(options) {
  const {
    mdPath,
    outputPath,
    masterPath,
    pandocPath,
    tempPath,
    backupMdPath,
    keepTemp = false,
  } = options;

  if (!mdPath) throw new Error('mdPath is required');
  const resolvedMaster = resolveMasterPath(masterPath);
  const resolvedPandoc = resolvePandocPath(pandocPath);
  const resolvedMd = path.resolve(mdPath);
  const resolvedOutput = path.resolve(outputPath);
  const resolvedTemp = path.resolve(tempPath || createTempDocxPath(resolvedMd));
  const resolvedBackupMd = backupMdPath ? path.resolve(backupMdPath) : defaultBackupMdPath(resolvedMd);

  execFileSync(
    resolvedPandoc,
    [
      '--from=gfm',
      '--to=docx',
      '--wrap=none',
      `--reference-doc=${resolvedMaster}`,
      '-o',
      resolvedTemp,
      resolvedMd,
    ],
    {
      cwd: path.dirname(resolvedMd),
      stdio: 'inherit',
    }
  );

  try {
    return processReview({
      inputPath: resolvedTemp,
      outputPath: resolvedOutput,
      masterPath: resolvedMaster,
      mdPath: resolvedMd,
      backupMdPath: resolvedBackupMd,
    });
  } finally {
    if (!keepTemp && fs.existsSync(resolvedTemp)) fs.unlinkSync(resolvedTemp);
  }
}

module.exports = {
  buildFromMarkdown,
  resolvePandocPath,
};
