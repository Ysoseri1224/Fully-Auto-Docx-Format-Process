const modeSelect = document.getElementById('mode');
const inputPathEl = document.getElementById('inputPath');
const suffixEl = document.getElementById('suffix');
const masterPathEl = document.getElementById('masterPath');
const pandocPathEl = document.getElementById('pandocPath');
const backupMdPathEl = document.getElementById('backupMdPath');
const outputEl = document.getElementById('output');
const chooseBtn = document.getElementById('chooseFile');
const runBtn = document.getElementById('run');

chooseBtn.addEventListener('click', async () => {
  const picked = await window.writemaster.pickFile(modeSelect.value);
  if (picked) inputPathEl.value = picked;
});

runBtn.addEventListener('click', async () => {
  outputEl.textContent = 'Processing...';
  const result = await window.writemaster.run({
    mode: modeSelect.value,
    inputPath: inputPathEl.value.trim(),
    name: suffixEl.value.trim() || undefined,
    masterPath: masterPathEl.value.trim() || undefined,
    pandocPath: pandocPathEl.value.trim() || undefined,
    backupMdPath: backupMdPathEl.value.trim() || undefined,
  });
  outputEl.textContent = result.ok
    ? `Done: ${result.outputPath}`
    : `Failed:\n${result.error}`;
});
