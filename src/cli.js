#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildFromMarkdown } = require('./core/build');
const { describeDefaultMaster, processReview } = require('./core/review');

function printHelp() {
  console.log(`writemaster

Usage:
  writemaster --md <file.md> [name]
  writemaster --docx <file.docx> [name]

Optional:
  --out <file.docx>       Write to an explicit output path
  --master <file.docx>    Override the review master template
  --pandoc <path>         Override the pandoc executable for --md
  --backup-md <file.md>   Optional backup markdown for table recovery
  --keep-temp             Keep the intermediate temp docx for --md
  --help                  Show this help

Rules:
  --md xxx.md name     -> xxx_name.docx
  --md xxx.md          -> xxx.docx
  --docx xxx.docx name -> xxx_name.docx
  --docx xxx.docx      -> xxx_review.docx

Default master:
  ${describeDefaultMaster()}`);
}

function parseArgs(argv) {
  const args = {
    keepTemp: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--md':
        args.mode = 'md';
        args.input = argv[++i];
        break;
      case '--docx':
        args.mode = 'docx';
        args.input = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--master':
        args.master = argv[++i];
        break;
      case '--pandoc':
        args.pandoc = argv[++i];
        break;
      case '--backup-md':
        args.backupMd = argv[++i];
        break;
      case '--keep-temp':
        args.keepTemp = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        positional.push(arg);
        break;
    }
  }

  args.name = positional[0];
  return args;
}

function buildOutputPath(inputPath, mode, name, explicitOut) {
  if (explicitOut) return path.resolve(explicitOut);
  const resolvedInput = path.resolve(inputPath);
  const dir = path.dirname(resolvedInput);
  const ext = path.extname(resolvedInput);
  const base = path.basename(resolvedInput, ext);
  if (mode === 'md') {
    const filename = name ? `${base}_${name}.docx` : `${base}.docx`;
    return path.join(dir, filename);
  }
  const filename = name ? `${base}_${name}.docx` : `${base}_review.docx`;
  return path.join(dir, filename);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.mode || !args.input) {
    printHelp();
    return;
  }
  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file not found: ${args.input}`);
  }

  const outputPath = buildOutputPath(args.input, args.mode, args.name, args.out);
  if (args.mode === 'md') {
    buildFromMarkdown({
      mdPath: args.input,
      outputPath,
      masterPath: args.master,
      pandocPath: args.pandoc,
      backupMdPath: args.backupMd,
      keepTemp: args.keepTemp,
    });
  } else {
    processReview({
      inputPath: path.resolve(args.input),
      outputPath,
      masterPath: args.master,
      mdPath: args.backupMd,
      backupMdPath: undefined,
    });
  }
  console.log(`Built: ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  buildOutputPath,
};
