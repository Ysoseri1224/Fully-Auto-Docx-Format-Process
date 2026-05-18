const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const templatePath = path.join(repoRoot, 'templates', 'review-master.docx');
const generatedPath = path.join(repoRoot, 'src', 'generated', 'embedded-master.js');
const outfile = path.join(repoRoot, 'dist', 'writemaster.single.cjs');
const placeholder = 'module.exports = null;\n';

async function main() {
  const original = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : placeholder;
  const templateBase64 = fs.readFileSync(templatePath).toString('base64');
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `module.exports = ${JSON.stringify(templateBase64)};\n`);
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
