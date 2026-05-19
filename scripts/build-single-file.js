const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const templateEntries = [
  {
    id: 'review-master',
    label: '教材 Review 母版',
    kind: 'review',
    description: '默认教材整理母版。',
    filename: 'review-master.docx',
  },
  {
    id: 'chapter10-monograph',
    label: '第10章专著母版',
    kind: 'monograph',
    description: '专著章节样式母版。',
    filename: 'chapter10-monograph.docx',
  },
];
const generatedPath = path.join(repoRoot, 'src', 'generated', 'embedded-masters.js');
const outfile = path.join(repoRoot, 'dist', 'writemaster.single.cjs');
const placeholder = 'module.exports = [];\n';

async function main() {
  const original = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : placeholder;
  const masters = templateEntries.map((entry) => {
    const templatePath = path.join(repoRoot, 'templates', entry.filename);
    return {
      ...entry,
      sourceType: 'embedded',
      base64: fs.readFileSync(templatePath).toString('base64'),
    };
  });
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `module.exports = ${JSON.stringify(masters, null, 2)};\n`);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });

  try {
    await esbuild.build({
      entryPoints: [path.join(repoRoot, 'src', 'cli-single-file.js')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile,
    });
  } finally {
    fs.writeFileSync(generatedPath, original || placeholder);
  }
  console.log(`Built single-file bundle: ${outfile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
