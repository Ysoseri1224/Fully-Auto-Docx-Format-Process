const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('xmldom');
const embeddedMasters = require('../generated/embedded-masters');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TOC_STYLES = new Set(['TOC1', 'TOC2', 'TOC3', 'TOC', 'TOCHeading']);
const MASTER_REGISTRY = [
  {
    id: 'review-master',
    label: '教材 Review 母版',
    kind: 'review',
    description: '默认教材整理母版。',
    filename: 'review-master.docx',
    isDefault: true,
  },
  {
    id: 'chapter10-monograph',
    label: '第10章专著母版',
    kind: 'monograph',
    description: '专著章节样式母版。',
    filename: 'chapter10-monograph.docx',
    isDefault: false,
  },
  {
    id: 'graduate-thesis',
    label: '毕业论文模板1',
    kind: 'thesis',
    description: '毕业论文/设计母版。',
    filename: 'graduate-thesis.doc',
    isDefault: false,
  },
];
const DEFAULT_MASTER_ID = 'review-master';
const TEMPLATE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../templates'),
  path.resolve(__dirname, '../templates'),
];

let cachedEmbeddedMasterPaths = new Map();
let cachedExternalizedMasterPath = null;

function listBuiltInMasters() {
  return MASTER_REGISTRY.map((entry) => {
    const embedded = Array.isArray(embeddedMasters) ? embeddedMasters.find((item) => item.id === entry.id) : null;
    return {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      description: entry.description,
      isDefault: entry.id === DEFAULT_MASTER_ID,
      sourceType: embedded ? 'embedded' : 'filesystem',
      filename: entry.filename,
    };
  });
}

function findBuiltInMaster(masterId) {
  const id = masterId || DEFAULT_MASTER_ID;
  return MASTER_REGISTRY.find((entry) => entry.id === id) || MASTER_REGISTRY.find((entry) => entry.id === DEFAULT_MASTER_ID);
}

function findMasterFileOnDisk(entry) {
  if (!entry) return null;
  for (const dir of TEMPLATE_DIR_CANDIDATES) {
    const fp = path.join(dir, entry.filename);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

function ensureEmbeddedMasterFile(masterId) {
  const entry = Array.isArray(embeddedMasters) ? embeddedMasters.find((item) => item.id === masterId) : null;
  if (!entry || !entry.base64) return null;
  const cached = cachedEmbeddedMasterPaths.get(masterId);
  if (cached && fs.existsSync(cached)) return cached;
  const hash = crypto.createHash('sha1').update(entry.base64).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), 'writemaster');
  const fp = path.join(dir, `${masterId}-${hash}.docx`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, Buffer.from(entry.base64, 'base64'));
  cachedEmbeddedMasterPaths.set(masterId, fp);
  return fp;
}

function convertDocToDocx(docPath) {
  const abs = path.resolve(docPath);
  const hash = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 12);
  const cacheDir = path.join(os.tmpdir(), 'writemaster', 'doc-cache');
  const cached = path.join(cacheDir, `${path.basename(abs, '.doc')}-${hash}.docx`);
  if (fs.existsSync(cached)) return cached;
  fs.mkdirSync(cacheDir, { recursive: true });
  const scriptPath = path.join(cacheDir, `convert-${hash}.ps1`);
  fs.writeFileSync(scriptPath, [
    '$ErrorActionPreference = "Stop"',
    '$word = $null',
    'try {',
    '  $word = New-Object -ComObject Word.Application',
    '  $word.Visible = $false',
    '  $doc = $word.Documents.Open(\'' + abs + '\')',
    '  $doc.SaveAs2([ref]\'' + cached + '\', 16)',
    '  $doc.Close([ref]$false)',
    '} catch {',
    '  Write-Error $_.Exception.Message',
    '  exit 1',
    '} finally {',
    '  try { if ($word) { $word.Quit([ref]$false) } } catch {}',
    '  if ($word) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null }',
    '}',
  ].join('\r\n'));
  try {
    const psExe = fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
      : 'powershell.exe';
    execFileSync(psExe, [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    ], { stdio: 'pipe', timeout: 60000 });
  } catch (e) {
    throw new Error(
      'Failed to convert .doc to .docx. Microsoft Word is required.\n' +
      (e.stderr ? e.stderr.toString().trim() : e.message)
    );
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) {}
  }
  if (!fs.existsSync(cached)) {
    throw new Error('Word COM conversion produced no output. Is Microsoft Word installed?');
  }
  return cached;
}

function externalizeMasterFile(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  if (!sourcePath.includes('app.asar')) return sourcePath;
  if (cachedExternalizedMasterPath && fs.existsSync(cachedExternalizedMasterPath)) return cachedExternalizedMasterPath;
  const hash = crypto.createHash('sha1').update(fs.readFileSync(sourcePath)).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), 'writemaster');
  const fp = path.join(dir, `review-master-asar-${hash}.docx`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, fs.readFileSync(sourcePath));
  cachedExternalizedMasterPath = fp;
  return fp;
}

function ensureDocx(filePath) {
  if (!filePath) return filePath;
  if (path.extname(filePath).toLowerCase() === '.doc') return convertDocToDocx(filePath);
  return filePath;
}

function resolveMasterPath(masterInput, legacyCustomPath) {
  if (typeof masterInput === 'string' && !legacyCustomPath) {
    if (fs.existsSync(masterInput)) return ensureDocx(externalizeMasterFile(masterInput));
    const builtIn = findBuiltInMaster(masterInput);
    if (builtIn && builtIn.id === masterInput) {
      const diskPath = findMasterFileOnDisk(builtIn);
      if (diskPath) return ensureDocx(externalizeMasterFile(diskPath));
      const embedded = ensureEmbeddedMasterFile(builtIn.id);
      if (embedded) return ensureDocx(embedded);
    }
  }

  const options = masterInput && typeof masterInput === 'object'
    ? masterInput
    : { customPath: legacyCustomPath, masterPath: typeof masterInput === 'string' ? masterInput : undefined };

  const customPath = options.customPath || options.masterPath;
  if (customPath && fs.existsSync(customPath)) return ensureDocx(externalizeMasterFile(customPath));

  const selected = findBuiltInMaster(options.masterId);
  const diskPath = findMasterFileOnDisk(selected);
  if (diskPath) return ensureDocx(externalizeMasterFile(diskPath));
  const embedded = ensureEmbeddedMasterFile(selected.id);
  if (embedded) return ensureDocx(embedded);
  return customPath || path.join(TEMPLATE_DIR_CANDIDATES[0], selected.filename);
}

function describeDefaultMaster() {
  const masters = listBuiltInMasters()
    .map((master) => `${master.id}${master.isDefault ? ' (default)' : ''}`)
    .join(', ');
  return `built-in masters: ${masters}`;
}

function loadDocx(fp) {
  return new PizZip(fs.readFileSync(fp));
}

function getXml(zip, entry) {
  const f = zip.file(entry);
  return f ? f.asText() : null;
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function importNode(doc, src) {
  if (src.nodeType === 3) return doc.createTextNode(src.nodeValue);
  if (src.nodeType === 8) return doc.createComment(src.nodeValue);
  const el = doc.createElementNS(src.namespaceURI || W_NS, src.nodeName);
  for (let i = 0; i < (src.attributes || []).length; i++) {
    const a = src.attributes[i];
    el.setAttributeNS(a.namespaceURI, a.name, a.value);
  }
  for (let i = 0; i < src.childNodes.length; i++) {
    el.appendChild(importNode(doc, src.childNodes[i]));
  }
  return el;
}

function childArray(node) {
  const arr = [];
  for (let i = 0; i < node.childNodes.length; i++) arr.push(node.childNodes[i]);
  return arr;
}

function getParagraphText(pEl) {
  const tEls = pEl.getElementsByTagNameNS(W_NS, 't');
  let text = '';
  for (let i = 0; i < tEls.length; i++) text += tEls[i].textContent || '';
  return text.trim();
}

function getParagraphStyleId(pEl) {
  const ps = pEl.getElementsByTagNameNS(W_NS, 'pStyle')[0];
  return ps ? ps.getAttribute('w:val') : null;
}

function isExampleTitle(text) {
  return /^【例\s*\d+-\d+】/.test(text);
}

function isNoteParagraph(text) {
  return /^(说明|提示|注意)[:：]/.test(text);
}

function isSqlLikeParagraph(text, currentStyleId) {
  if (/[。；：，]/.test(text)) return false;
  if (/语句|用于|表示|可用于|命令/.test(text)) return false;
  if (currentStyleId === 'SourceCode') return true;
  if (!/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SHOW|USE|DESC|EXPLAIN)\b/i.test(text)) return false;
  return true;
}

function getPreviousParagraph(node) {
  let cur = node ? node.previousSibling : null;
  while (cur) {
    if (cur.nodeType === 1 && cur.localName === 'p' && getParagraphText(cur)) return cur;
    cur = cur.previousSibling;
  }
  return null;
}

function getNextParagraph(node) {
  let cur = node ? node.nextSibling : null;
  while (cur) {
    if (cur.nodeType === 1 && cur.localName === 'p' && getParagraphText(cur)) return cur;
    cur = cur.nextSibling;
  }
  return null;
}

function ensurePPr(doc, pEl) {
  let pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, 'w:pPr');
    pEl.insertBefore(pPr, pEl.firstChild);
  }
  return pPr;
}

function setParagraphStyle(doc, pEl, styleId) {
  const pPr = ensurePPr(doc, pEl);
  let pStyle = pPr.getElementsByTagNameNS(W_NS, 'pStyle')[0];
  if (!pStyle) {
    pStyle = doc.createElementNS(W_NS, 'w:pStyle');
    pPr.insertBefore(pStyle, pPr.firstChild);
  }
  pStyle.setAttribute('w:val', styleId);
}

function cleanPPr(pEl) {
  const pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (!pPr) return;
  const keep = new Set(['pStyle', 'numPr', 'sectPr', 'rPr']);
  const toRemove = [];
  for (let i = 0; i < pPr.childNodes.length; i++) {
    const c = pPr.childNodes[i];
    if (c.nodeType !== 1) continue;
    if (!keep.has(c.localName)) toRemove.push(c);
  }
  toRemove.forEach((c) => pPr.removeChild(c));
}

function readLines(fp) {
  if (!fp || !fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf8').split(/\r?\n/);
}

function parseMarkdownTables(mdPath, backupPath) {
  if (!mdPath && !backupPath) return new Map();
  const lines = [...readLines(mdPath), ...readLines(backupPath)];
  const tables = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTrigger = /^表\s*\d+-\d+/.test(line) || line.includes('如下表所示') || /^函数与作用可概括如下/.test(line);
    if (!isTrigger) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length || !lines[j].trim().startsWith('|')) continue;
    const rows = [];
    while (j < lines.length && lines[j].trim().startsWith('|')) {
      const cells = lines[j].trim().split('|').map((x) => x.trim()).filter(Boolean);
      if (cells.length && !cells.every((c) => /^-+$/.test(c.replace(/:/g, '')))) rows.push(cells);
      j++;
    }
    if (!rows.length) continue;
    const key = /^表\s*\d+-\d+/.test(line)
      ? line.replace(/\s+/g, ' ').trim()
      : line.includes('视图与基本表')
        ? '视图与基本表的主要区别如下表所示：'
        : '函数与作用可概括如下：';
    if (!tables.has(key)) tables.set(key, rows);
  }
  return tables;
}

function copyMasterPackage(masterZip, targetZip) {
  ['word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'word/fontTable.xml', 'word/theme/theme1.xml', 'word/endnotes.xml', 'word/footnotes.xml'].forEach((entry) => {
    const text = getXml(masterZip, entry);
    if (text) targetZip.file(entry, text);
  });
  const relsPath = 'word/_rels/document.xml.rels';
  const relsXml = getXml(targetZip, relsPath);
  if (relsXml) {
    const relsDoc = parseXml(relsXml);
    const rels = relsDoc.getElementsByTagName('Relationship');
    let hasEndnotes = false;
    let hasFoootnotes = false;
    let maxId = 0;
    for (let i = 0; i < rels.length; i++) {
      const type = rels[i].getAttribute('Type');
      if (type.includes('/endnotes')) hasEndnotes = true;
      if (type.includes('/footnotes')) hasFoootnotes = true;
      const rid = rels[i].getAttribute('Id') || '';
      const num = parseInt(rid.replace('rId', ''), 10);
      if (num > maxId) maxId = num;
    }
    const root = relsDoc.documentElement;
    if (!hasEndnotes && targetZip.file('word/endnotes.xml')) {
      const el = relsDoc.createElement('Relationship');
      el.setAttribute('Id', 'rId' + (++maxId));
      el.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes');
      el.setAttribute('Target', 'endnotes.xml');
      root.appendChild(el);
    }
    if (!hasFoootnotes && targetZip.file('word/footnotes.xml')) {
      const el = relsDoc.createElement('Relationship');
      el.setAttribute('Id', 'rId' + (++maxId));
      el.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes');
      el.setAttribute('Target', 'footnotes.xml');
      root.appendChild(el);
    }
    if (!hasEndnotes || !hasFoootnotes) {
      targetZip.file(relsPath, new XMLSerializer().serializeToString(relsDoc));
    }
  }
  const ctPath = '[Content_Types].xml';
  const ctXml = getXml(targetZip, ctPath);
  if (ctXml) {
    const ctDoc = parseXml(ctXml);
    const overrides = ctDoc.getElementsByTagName('Override');
    let hasEndnotesCT = false;
    let hasFootnotesCT = false;
    for (let i = 0; i < overrides.length; i++) {
      const pn = overrides[i].getAttribute('PartName');
      if (pn === '/word/endnotes.xml') hasEndnotesCT = true;
      if (pn === '/word/footnotes.xml') hasFootnotesCT = true;
    }
    const root = ctDoc.documentElement;
    if (!hasEndnotesCT && targetZip.file('word/endnotes.xml')) {
      const el = ctDoc.createElement('Override');
      el.setAttribute('PartName', '/word/endnotes.xml');
      el.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml');
      root.appendChild(el);
    }
    if (!hasFootnotesCT && targetZip.file('word/footnotes.xml')) {
      const el = ctDoc.createElement('Override');
      el.setAttribute('PartName', '/word/footnotes.xml');
      el.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml');
      root.appendChild(el);
    }
    if (!hasEndnotesCT || !hasFootnotesCT) {
      targetZip.file(ctPath, new XMLSerializer().serializeToString(ctDoc));
    }
  }
}

function patchHeadingStyles(targetZip) {
  const stylesXml = getXml(targetZip, 'word/styles.xml');
  if (!stylesXml) return;
  const stylesDoc = parseXml(stylesXml);
  const styles = stylesDoc.getElementsByTagNameNS(W_NS, 'style');
  for (let i = 0; i < styles.length; i++) {
    const id = styles[i].getAttribute('w:styleId');
    if (id !== '1' && id !== '2' && id !== '3') continue;
    const pPr = styles[i].getElementsByTagNameNS(W_NS, 'pPr')[0];
    if (!pPr) continue;
    const numPr = pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
    if (numPr) pPr.removeChild(numPr);
    if (id === '1') continue;
    let spacing = pPr.getElementsByTagNameNS(W_NS, 'spacing')[0];
    if (!spacing) {
      spacing = stylesDoc.createElementNS(W_NS, 'w:spacing');
      pPr.appendChild(spacing);
    }
    if (id === '2') {
      spacing.setAttribute('w:before', '260');
      spacing.setAttribute('w:after', '120');
      spacing.setAttribute('w:line', '288');
      spacing.setAttribute('w:lineRule', 'auto');
      spacing.removeAttribute('w:beforeLines');
      spacing.removeAttribute('w:afterLines');
    }
    if (id === '3') {
      spacing.setAttribute('w:before', '260');
      spacing.setAttribute('w:after', '120');
      spacing.setAttribute('w:line', '288');
      spacing.setAttribute('w:lineRule', 'auto');
      spacing.removeAttribute('w:beforeLines');
      spacing.removeAttribute('w:afterLines');
    }
    let rPr = styles[i].getElementsByTagNameNS(W_NS, 'rPr')[0];
    if (!rPr) {
      rPr = stylesDoc.createElementNS(W_NS, 'w:rPr');
      styles[i].appendChild(rPr);
    }
    while (rPr.firstChild) rPr.removeChild(rPr.firstChild);
    const rFonts = stylesDoc.createElementNS(W_NS, 'w:rFonts');
    rFonts.setAttribute('w:ascii', '等线');
    rFonts.setAttribute('w:eastAsia', '等线');
    rFonts.setAttribute('w:hAnsi', '等线');
    rPr.appendChild(rFonts);
    rPr.appendChild(stylesDoc.createElementNS(W_NS, 'w:b'));
    rPr.appendChild(stylesDoc.createElementNS(W_NS, 'w:bCs'));
    const sz = stylesDoc.createElementNS(W_NS, 'w:sz');
    sz.setAttribute('w:val', id === '2' ? '30' : '24');
    rPr.appendChild(sz);
    const szCs = stylesDoc.createElementNS(W_NS, 'w:szCs');
    szCs.setAttribute('w:val', id === '2' ? '30' : '24');
    rPr.appendChild(szCs);
  }
  targetZip.file('word/styles.xml', serializeXml(stylesDoc));
}

function buildStyleMap(zip) {
  const stylesDoc = parseXml(getXml(zip, 'word/styles.xml'));
  const nameToId = {};
  const styleRpr = {};
  const styleEls = stylesDoc.getElementsByTagNameNS(W_NS, 'style');
  for (let i = 0; i < styleEls.length; i++) {
    const s = styleEls[i];
    const id = s.getAttribute('w:styleId');
    const name = s.getElementsByTagNameNS(W_NS, 'name')[0];
    if (name) nameToId[name.getAttribute('w:val')] = id;
    for (let j = 0; j < s.childNodes.length; j++) {
      const c = s.childNodes[j];
      if (c.nodeType === 1 && c.localName === 'rPr') {
        styleRpr[id] = c;
        break;
      }
    }
  }
  // Extract docDefaults
  let docDefaultsRpr = null;
  let docDefaultsPpr = null;
  const docDefaultsEl = stylesDoc.getElementsByTagNameNS(W_NS, 'docDefaults')[0];
  if (docDefaultsEl) {
    const rPrDefault = docDefaultsEl.getElementsByTagNameNS(W_NS, 'rPrDefault')[0];
    if (rPrDefault) docDefaultsRpr = rPrDefault.getElementsByTagNameNS(W_NS, 'rPr')[0] || null;
    const pPrDefault = docDefaultsEl.getElementsByTagNameNS(W_NS, 'pPrDefault')[0];
    if (pPrDefault) docDefaultsPpr = pPrDefault.getElementsByTagNameNS(W_NS, 'pPr')[0] || null;
  }
  return { stylesDoc, nameToId, styleRpr, docDefaultsRpr, docDefaultsPpr };
}

function paintRuns(doc, pEl, styleId, styleRpr) {
  const tpl = styleRpr[styleId];
  const runs = pEl.getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.parentNode !== pEl) continue;
    const existing = r.getElementsByTagNameNS(W_NS, 'rPr')[0];
    let vertAlign = null;
    if (existing) {
      const va = existing.getElementsByTagNameNS(W_NS, 'vertAlign')[0];
      if (va) vertAlign = va.cloneNode(true);
      r.removeChild(existing);
    }
    if (tpl) {
      const newRpr = importNode(doc, tpl);
      if (vertAlign) newRpr.appendChild(vertAlign);
      r.insertBefore(newRpr, r.firstChild);
    } else if (vertAlign) {
      const newRpr = doc.createElementNS(W_NS, 'w:rPr');
      newRpr.appendChild(vertAlign);
      r.insertBefore(newRpr, r.firstChild);
    }
  }
}

function classify(text, currentStyleId, styleIds, prevIsCode) {
  if (!text) return null;
  if (text === '应用篇' || /^项目[一二三四五六七八九十0-9]/.test(text) || /^第\d+章\s/.test(text)) return '1';
  if (/^\[[^\]]+\]$/.test(text) && !prevIsCode && !/^\[公式/.test(text) && !/^\[图/.test(text) && !/^\[表/.test(text)) {
    if (/^任务\s*\d+/.test(text) || /^\d+\.\d+\s/.test(text)) return '2';
    return '2';
  }
  if (/^任务\s*\d+/.test(text) || /^\d+\.\d+\s/.test(text)) return '2';
  if (/^\d+\.\d+\.\d+\s/.test(text)) return '3';
  if (/^图\s*\d+/.test(text) || /^表\s*\d+/.test(text)) return styleIds.caption;
  if (isNoteParagraph(text)) return styleIds.note;
  if (isSqlLikeParagraph(text, currentStyleId)) return styleIds.code;
  return styleIds.body;
}

function normalizeCodeText(text) {
  let s = text.replace(/\s+/g, ' ').trim();
  s = s.replace(/([A-Za-z0-9_)\]])(DEFAULT CHARACTER SET|DEFAULT COLLATE|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|VALUES|ON DELETE|ON UPDATE|SET|ENGINE=|DEFAULT CHARSET=)\b/g, '$1\n$2');
  s = s.replace(/,\s*/g, ',\n');
  s = s.replace(/\bFROM\b/g, '\nFROM');
  s = s.replace(/\bWHERE\b/g, '\nWHERE');
  s = s.replace(/\bGROUP BY\b/g, '\nGROUP BY');
  s = s.replace(/\bHAVING\b/g, '\nHAVING');
  s = s.replace(/\bORDER BY\b/g, '\nORDER BY');
  s = s.replace(/\bLIMIT\b/g, '\nLIMIT');
  s = s.replace(/\bVALUES\s*\(/g, '\nVALUES (');
  s = s.replace(/\bON DELETE\b/g, '\nON DELETE');
  s = s.replace(/\bON UPDATE\b/g, '\nON UPDATE');
  s = s.replace(/\n{2,}/g, '\n');
  return s.replace(/\n{2,}/g, '\n').trim();
}

function insertAfter(body, anchor, node) {
  if (anchor.nextSibling) body.insertBefore(node, anchor.nextSibling);
  else body.appendChild(node);
}

function makeRun(doc, text, styleId, styleRpr, bold = false) {
  const r = doc.createElementNS(W_NS, 'w:r');
  const tpl = styleRpr[styleId];
  if (tpl) r.appendChild(importNode(doc, tpl));
  if (bold) {
    let rPr = r.getElementsByTagNameNS(W_NS, 'rPr')[0];
    if (!rPr) {
      rPr = doc.createElementNS(W_NS, 'w:rPr');
      r.insertBefore(rPr, r.firstChild);
    }
    rPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
    rPr.appendChild(doc.createElementNS(W_NS, 'w:bCs'));
  }
  const t = doc.createElementNS(W_NS, 'w:t');
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  return r;
}

function clearParagraphRuns(pEl) {
  const runs = childArray(pEl).filter((n) => n.nodeType === 1 && n.localName === 'r');
  runs.forEach((r) => {
    // Preserve runs that contain drawings or VML images
    const hasDrawing = r.getElementsByTagNameNS(W_NS, 'drawing').length;
    const hasPict = r.getElementsByTagNameNS(W_NS, 'pict').length;
    if (!hasDrawing && !hasPict) {
      pEl.removeChild(r);
    }
  });
}

function extractParagraphLines(pEl) {
  const lines = [];
  let current = '';
  const flush = () => {
    const value = current.trim();
    if (value) lines.push(value);
    current = '';
  };
  const visit = (node) => {
    if (!node) return;
    if (node.nodeType === 1 && node.localName === 'br') {
      flush();
      return;
    }
    if (node.nodeType === 1 && node.localName === 't') {
      current += node.textContent || '';
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) visit(node.childNodes[i]);
  };
  for (let i = 0; i < pEl.childNodes.length; i++) visit(pEl.childNodes[i]);
  flush();
  return lines;
}

function splitParagraphIntoParagraphs(doc, body, pEl, lines, styleId, styleRpr) {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);
  if (!normalized.length) return;
  setParagraphStyle(doc, pEl, styleId);
  cleanPPr(pEl);
  clearParagraphRuns(pEl);
  pEl.appendChild(makeRun(doc, normalized[0], styleId, styleRpr));
  let anchor = pEl;
  for (let i = 1; i < normalized.length; i++) {
    const nextP = doc.createElementNS(W_NS, 'w:p');
    setParagraphStyle(doc, nextP, styleId);
    cleanPPr(nextP);
    nextP.appendChild(makeRun(doc, normalized[i], styleId, styleRpr));
    insertAfter(body, anchor, nextP);
    anchor = nextP;
  }
}

function splitNoteParagraph(doc, body, pEl, styleId, styleRpr) {
  const text = getParagraphText(pEl);
  const match = text.match(/^(说明|提示|注意)([:：])(.*)$/);
  if (!match) return null;
  const prefix = `${match[1]}${match[2]}`;
  const rest = (match[3] || '').trim();
  setParagraphStyle(doc, pEl, styleId);
  cleanPPr(pEl);
  clearParagraphRuns(pEl);
  pEl.appendChild(makeRun(doc, prefix, styleId, styleRpr, true));
  if (rest) {
    const nextP = doc.createElementNS(W_NS, 'w:p');
    setParagraphStyle(doc, nextP, styleId);
    cleanPPr(nextP);
    nextP.appendChild(makeRun(doc, rest, styleId, styleRpr));
    insertAfter(body, pEl, nextP);
    return null;
  } else {
    const following = getNextParagraph(pEl);
    if (following) {
      setParagraphStyle(doc, following, styleId);
      cleanPPr(following);
      paintRuns(doc, following, styleId, styleRpr);
      return following;
    }
  }
  return null;
}

function rewriteTextRuns(doc, pEl, text, styleId, styleRpr, bold = false) {
  clearParagraphRuns(pEl);
  pEl.appendChild(makeRun(doc, text, styleId, styleRpr, bold));
}

function getOrCreateNumberingDoc(targetZip) {
  let xml = getXml(targetZip, 'word/numbering.xml');
  if (!xml) xml = `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="${W_NS}"/>`;
  return parseXml(xml);
}

function getMaxNumId(numDoc) {
  let max = 0;
  const nums = numDoc.getElementsByTagNameNS(W_NS, 'num');
  for (let i = 0; i < nums.length; i++) {
    const v = parseInt(nums[i].getAttribute('w:numId') || '0', 10);
    if (v > max) max = v;
  }
  return max;
}

function getMaxAbstractNumId(numDoc) {
  let max = -1;
  const abs = numDoc.getElementsByTagNameNS(W_NS, 'abstractNum');
  for (let i = 0; i < abs.length; i++) {
    const v = parseInt(abs[i].getAttribute('w:abstractNumId') || '0', 10);
    if (v > max) max = v;
  }
  return max;
}

function findOrCreateAbstractNum(numDoc, numFmt, lvlText) {
  const abs = numDoc.getElementsByTagNameNS(W_NS, 'abstractNum');
  for (let i = 0; i < abs.length; i++) {
    const lvls = abs[i].getElementsByTagNameNS(W_NS, 'lvl');
    for (let j = 0; j < lvls.length; j++) {
      if (lvls[j].getAttribute('w:ilvl') !== '0') continue;
      const fmtEl = lvls[j].getElementsByTagNameNS(W_NS, 'numFmt')[0];
      const txtEl = lvls[j].getElementsByTagNameNS(W_NS, 'lvlText')[0];
      const f = fmtEl && fmtEl.getAttribute('w:val');
      const t = txtEl && txtEl.getAttribute('w:val');
      if (f === numFmt && t === lvlText) {
        const indEl = lvls[j].getElementsByTagNameNS(W_NS, 'ind')[0];
        if (indEl) {
          indEl.setAttribute('w:left', '0');
          indEl.setAttribute('w:hanging', '0');
        }
        let suffEl = lvls[j].getElementsByTagNameNS(W_NS, 'suff')[0];
        if (!suffEl) {
          suffEl = numDoc.createElementNS(W_NS, 'w:suff');
          lvls[j].appendChild(suffEl);
        }
        suffEl.setAttribute('w:val', 'nothing');
        return parseInt(abs[i].getAttribute('w:abstractNumId'), 10);
      }
    }
  }
  const newId = getMaxAbstractNumId(numDoc) + 1;
  const absEl = numDoc.createElementNS(W_NS, 'w:abstractNum');
  absEl.setAttribute('w:abstractNumId', String(newId));
  const lvl = numDoc.createElementNS(W_NS, 'w:lvl');
  lvl.setAttribute('w:ilvl', '0');
  const startEl = numDoc.createElementNS(W_NS, 'w:start');
  startEl.setAttribute('w:val', '1');
  lvl.appendChild(startEl);
  const fmtEl = numDoc.createElementNS(W_NS, 'w:numFmt');
  fmtEl.setAttribute('w:val', numFmt);
  lvl.appendChild(fmtEl);
  const txtEl = numDoc.createElementNS(W_NS, 'w:lvlText');
  txtEl.setAttribute('w:val', lvlText);
  lvl.appendChild(txtEl);
  const jcEl = numDoc.createElementNS(W_NS, 'w:lvlJc');
  jcEl.setAttribute('w:val', 'left');
  lvl.appendChild(jcEl);
  const suffEl = numDoc.createElementNS(W_NS, 'w:suff');
  suffEl.setAttribute('w:val', 'nothing');
  lvl.appendChild(suffEl);
  absEl.appendChild(lvl);
  const firstNum = numDoc.getElementsByTagNameNS(W_NS, 'num')[0];
  if (firstNum) {
    numDoc.documentElement.insertBefore(absEl, firstNum);
  } else {
    numDoc.documentElement.appendChild(absEl);
  }
  return newId;
}

function cloneNum(numDoc, abstractNumId) {
  const num = numDoc.createElementNS(W_NS, 'w:num');
  const id = String(getMaxNumId(numDoc) + 1);
  num.setAttribute('w:numId', id);
  const abs = numDoc.createElementNS(W_NS, 'w:abstractNumId');
  abs.setAttribute('w:val', String(abstractNumId));
  num.appendChild(abs);
  const lo = numDoc.createElementNS(W_NS, 'w:lvlOverride');
  lo.setAttribute('w:ilvl', '0');
  const so = numDoc.createElementNS(W_NS, 'w:startOverride');
  so.setAttribute('w:val', '1');
  lo.appendChild(so);
  num.appendChild(lo);
  numDoc.documentElement.appendChild(num);
  return id;
}

function setNumPr(doc, pEl, numId) {
  const pPr = ensurePPr(doc, pEl);
  let numPr = pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
  if (!numPr) {
    numPr = doc.createElementNS(W_NS, 'w:numPr');
    pPr.appendChild(numPr);
  } else {
    while (numPr.firstChild) numPr.removeChild(numPr.firstChild);
  }
  const ilvl = doc.createElementNS(W_NS, 'w:ilvl');
  ilvl.setAttribute('w:val', '0');
  const numIdEl = doc.createElementNS(W_NS, 'w:numId');
  numIdEl.setAttribute('w:val', String(numId));
  numPr.appendChild(ilvl);
  numPr.appendChild(numIdEl);
}

function stripLeadingParen(text) {
  return text.replace(/^[（(]\d+[）)]\s*/, '');
}

function stripLeadingCircled(text) {
  return text.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
}

function buildTable(doc, tableStyleId, rows) {
  const tbl = doc.createElementNS(W_NS, 'w:tbl');
  const tblPr = doc.createElementNS(W_NS, 'w:tblPr');
  const tblStyle = doc.createElementNS(W_NS, 'w:tblStyle');
  tblStyle.setAttribute('w:val', tableStyleId);
  tblPr.appendChild(tblStyle);
  tbl.appendChild(tblPr);
  const grid = doc.createElementNS(W_NS, 'w:tblGrid');
  for (let c = 0; c < rows[0].length; c++) {
    const gc = doc.createElementNS(W_NS, 'w:gridCol');
    gc.setAttribute('w:w', String(Math.floor(9000 / rows[0].length)));
    grid.appendChild(gc);
  }
  tbl.appendChild(grid);
  rows.forEach((row, ri) => {
    const tr = doc.createElementNS(W_NS, 'w:tr');
    row.forEach((cell, ci) => {
      const tc = doc.createElementNS(W_NS, 'w:tc');
      const tcPr = doc.createElementNS(W_NS, 'w:tcPr');
      const vAlign = doc.createElementNS(W_NS, 'w:vAlign');
      vAlign.setAttribute('w:val', 'center');
      tcPr.appendChild(vAlign);
      if (ri === 0) {
        const shd = doc.createElementNS(W_NS, 'w:shd');
        shd.setAttribute('w:val', 'clear');
        shd.setAttribute('w:color', 'auto');
        shd.setAttribute('w:fill', 'BFBFBF');
        shd.setAttribute('w:themeFill', 'background1');
        shd.setAttribute('w:themeFillShade', 'BF');
        tcPr.appendChild(shd);
      }
      tc.appendChild(tcPr);
      const p = doc.createElementNS(W_NS, 'w:p');
      const pPr = doc.createElementNS(W_NS, 'w:pPr');
      const ind = doc.createElementNS(W_NS, 'w:ind');
      ind.setAttribute('w:left', '0');
      ind.setAttribute('w:firstLine', '0');
      ind.setAttribute('w:firstLineChars', '0');
      pPr.appendChild(ind);
      const jc = doc.createElementNS(W_NS, 'w:jc');
      if (ri === 0 || ci === 0 || ci === row.length - 1) jc.setAttribute('w:val', 'center');
      else jc.setAttribute('w:val', 'left');
      pPr.appendChild(jc);
      p.appendChild(pPr);
      const r = doc.createElementNS(W_NS, 'w:r');
      const rPr = doc.createElementNS(W_NS, 'w:rPr');
      const sz = doc.createElementNS(W_NS, 'w:sz');
      sz.setAttribute('w:val', '24');
      const szCs = doc.createElementNS(W_NS, 'w:szCs');
      szCs.setAttribute('w:val', '24');
      rPr.appendChild(sz);
      rPr.appendChild(szCs);
      if (ri === 0) {
        rPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
        rPr.appendChild(doc.createElementNS(W_NS, 'w:bCs'));
      }
      r.appendChild(rPr);
      const t = doc.createElementNS(W_NS, 'w:t');
      t.appendChild(doc.createTextNode(cell));
      r.appendChild(t);
      p.appendChild(r);
      tc.appendChild(p);
      tr.appendChild(tc);
    });
    tbl.appendChild(tr);
  });
  return tbl;
}

function processReview(options) {
  const {
    inputPath,
    outputPath,
    masterPath,
    masterId,
    customMasterPath,
    mdPath,
    backupMdPath,
    profile,
  } = options;

  const resolvedMaster = resolveMasterPath({
    masterId,
    customPath: customMasterPath || masterPath,
    masterPath,
  });
  const masterZip = loadDocx(resolvedMaster);
  const targetZip = loadDocx(inputPath);
  copyMasterPackage(masterZip, targetZip);
  patchHeadingStyles(targetZip);
  const styleMap = buildStyleMap(targetZip);
  const numberingDoc = getOrCreateNumberingDoc(targetZip);
  const doc = parseXml(getXml(targetZip, 'word/document.xml'));
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const tableMap = parseMarkdownTables(mdPath, backupMdPath);

  const styleIds = {
    body: styleMap.nameToId['正文样式'] || styleMap.nameToId['论文正文'],
    caption: styleMap.nameToId['图、表标题样式'],
    code: styleMap.nameToId['示例语法格式'],
    note: styleMap.nameToId['提示说明样式'],
    table: styleMap.nameToId['Table Grid'] || 'TableGrid',
  };

  // Override with profile-specified style IDs if a profile is provided
  if (profile && profile.styles) {
    for (const [role, styleId] of Object.entries(profile.styles)) {
      if (styleId && styleIds.hasOwnProperty(role)) {
        styleIds[role] = styleId;
      }
    }
  }

  const children = childArray(body);
  const removeNodes = new Set();
  const insertions = [];
  const noteFollowers = new Set();
  for (const child of children) {
    if (child.nodeType !== 1 || child.localName !== 'p') continue;
    const text = getParagraphText(child);
    if (!text) continue;
    if (noteFollowers.has(child)) continue;
    const current = getParagraphStyleId(child);
    if (TOC_STYLES.has(current)) continue;
    const codeLike = isSqlLikeParagraph(text, current);
    const prev = getPreviousParagraph(child);
    const prevText = prev ? getParagraphText(prev) : '';
    const prevStyle = prev ? getParagraphStyleId(prev) : '';
    const prevIsCode = isSqlLikeParagraph(prevText, prevStyle);
    const exampleCode = codeLike && prev && isExampleTitle(prevText);
    const targetStyle = exampleCode ? styleIds.body : classify(text, current, styleIds, prevIsCode);
    if (targetStyle) {
      setParagraphStyle(doc, child, targetStyle);
      cleanPPr(child);
      if (targetStyle === '1' || targetStyle === '2' || targetStyle === '3') {
        setNumPr(doc, child, 0);
      } else {
        paintRuns(doc, child, targetStyle, styleMap.styleRpr);
      }
      if (targetStyle === styleIds.note) {
        const styled = splitNoteParagraph(doc, body, child, targetStyle, styleMap.styleRpr);
        if (styled) noteFollowers.add(styled);
      }
      if (codeLike) {
        const normalized = normalizeCodeText(text);
        const lines = normalized.split('\n');
        if (lines.length > 1) splitParagraphIntoParagraphs(doc, body, child, lines, targetStyle, styleMap.styleRpr);
        else if (normalized !== text) rewriteTextRuns(doc, child, normalized, targetStyle, styleMap.styleRpr);
      }
      if (isExampleTitle(text)) {
        const fixed = text.replace(/【例\s+(\d+-\d+)】/g, '【例$1】');
        rewriteTextRuns(doc, child, fixed, styleIds.body, styleMap.styleRpr);
      }
      const residualLines = extractParagraphLines(child);
      if (residualLines.length > 1 && targetStyle !== styleIds.code) {
        splitParagraphIntoParagraphs(doc, body, child, residualLines, targetStyle, styleMap.styleRpr);
      }
      if (/^[一二三四五六七八九十]+、/.test(text) && targetStyle === styleIds.body) {
        const runs = child.getElementsByTagNameNS(W_NS, 'r');
        for (let ri = 0; ri < runs.length; ri++) {
          if (runs[ri].parentNode !== child) continue;
          const rPr = runs[ri].getElementsByTagNameNS(W_NS, 'rPr')[0] || doc.createElementNS(W_NS, 'w:rPr');
          if (!rPr.parentNode) runs[ri].insertBefore(rPr, runs[ri].firstChild);
          if (!rPr.getElementsByTagNameNS(W_NS, 'b')[0]) rPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
        }
      }
    }
    const key = text.replace(/\s+/g, ' ').trim();
    if (tableMap.has(key)) {
      const rows = tableMap.get(key);
      const flat = rows.flat().map((x) => x.replace(/\s+/g, ''));
      let idx = 0;
      let node = child.nextSibling;
      while (node && idx < flat.length) {
        if (node.nodeType === 1 && node.localName === 'p') {
          const t = getParagraphText(node).replace(/\s+/g, '');
          if (t === flat[idx] || t === `${rows[idx]?.[0] || ''}：${rows[idx]?.[1] || ''}`.replace(/\s+/g, '')) {
            removeNodes.add(node);
            idx++;
            node = node.nextSibling;
            continue;
          }
        }
        break;
      }
      insertions.push({ after: child, tbl: buildTable(doc, styleIds.table, rows) });
    }
  }

  removeNodes.forEach((n) => n.parentNode === body && body.removeChild(n));
  insertions.forEach(({ after, tbl }) => body.insertBefore(tbl, after.nextSibling));

  const paras = childArray(body).filter((n) => n.nodeType === 1 && n.localName === 'p');
  const absParenId = findOrCreateAbstractNum(numberingDoc, 'decimal', '（%1）');
  const absDotId = findOrCreateAbstractNum(numberingDoc, 'decimal', '%1.');
  const absCircledId = findOrCreateAbstractNum(numberingDoc, 'decimalEnclosedCircleChinese', '%1　');

  // Fix orphaned numPr: Pandoc-generated numIds lost after master copy
  const validNumIds = new Set(['0']);
  const numEls = numberingDoc.getElementsByTagNameNS(W_NS, 'num');
  for (let i = 0; i < numEls.length; i++) validNumIds.add(numEls[i].getAttribute('w:numId'));
  let orphanDotNumId = null;
  let prevWasOrphan = false;
  for (const p of paras) {
    const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
    if (!pPr) { prevWasOrphan = false; continue; }
    const numPr = pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
    if (!numPr) { prevWasOrphan = false; continue; }
    const numIdEl = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
    if (!numIdEl) { prevWasOrphan = false; continue; }
    const nid = numIdEl.getAttribute('w:val');
    if (nid && !validNumIds.has(nid)) {
      if (!prevWasOrphan) orphanDotNumId = cloneNum(numberingDoc, absDotId);
      numIdEl.setAttribute('w:val', String(orphanDotNumId));
      const indEl = pPr.getElementsByTagNameNS(W_NS, 'ind')[0];
      if (indEl) pPr.removeChild(indEl);
      prevWasOrphan = true;
    } else {
      prevWasOrphan = false;
    }
  }

  let section = null;
  let groupNumId = null;
  let childNumId = null;
  let bodyNumId = null;
  let bodyCircledNumId = null;
  for (const p of paras) {
    const text = getParagraphText(p);
    const sid = getParagraphStyleId(p);
    if (!text) continue;
    if (text === '[项目目标]') {
      section = 'goal';
      groupNumId = cloneNum(numberingDoc, absDotId);
      childNumId = null;
      bodyNumId = null;
      bodyCircledNumId = null;
      continue;
    }
    if (text === '[项目要求]') {
      section = 'require';
      groupNumId = null;
      childNumId = cloneNum(numberingDoc, absParenId);
      bodyNumId = null;
      bodyCircledNumId = null;
      continue;
    }
    if (/^\[/.test(text) && text !== '[项目目标]' && text !== '[项目要求]') {
      section = null;
      groupNumId = null;
      childNumId = null;
      bodyCircledNumId = null;
    }
    if (sid === '2' || sid === '3') {
      bodyNumId = null;
      bodyCircledNumId = null;
    }

    if (section === 'goal' && /^(知识目标|能力目标|素养目标)$/.test(text)) {
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, text, styleIds.body, styleMap.styleRpr, true);
      setNumPr(doc, p, groupNumId);
      childNumId = cloneNum(numberingDoc, absParenId);
      continue;
    }
    if (section === 'goal' && /^[（(]\d+[）)]/.test(text)) {
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, childNumId);
      continue;
    }
    if (section === 'goal' && childNumId) {
      const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
      const hasNumPr = pPr && pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
      if (hasNumPr) {
        setParagraphStyle(doc, p, styleIds.body);
        cleanPPr(p);
        paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
        setNumPr(doc, p, childNumId);
        continue;
      }
    }
    if (section === 'require' && /^[（(]\d+[）)]/.test(text)) {
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, childNumId);
      continue;
    }
    if (section === 'require' && childNumId) {
      const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
      const hasNumPr = pPr && pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
      if (hasNumPr) {
        setParagraphStyle(doc, p, styleIds.body);
        cleanPPr(p);
        paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
        setNumPr(doc, p, childNumId);
        continue;
      }
    }
    if (!section && /^[（(]\d+[）)]/.test(text)) {
      if (!bodyNumId) bodyNumId = cloneNum(numberingDoc, absParenId);
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, bodyNumId);
      bodyCircledNumId = null;
      continue;
    }
    if (!section && /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)) {
      if (!bodyCircledNumId) bodyCircledNumId = cloneNum(numberingDoc, absCircledId);
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingCircled(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, bodyCircledNumId);
      continue;
    }
  }

  targetZip.file('word/document.xml', serializeXml(doc));
  targetZip.file('word/numbering.xml', serializeXml(numberingDoc));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, targetZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return outputPath;
}

if (require.main === module) {
  const [inputPath, outputPath, masterPath, mdPath, backupMdPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node review.js <input.docx> <output.docx> [master.docx] [source.md] [backup.md]');
  }
  processReview({
    inputPath: path.resolve(process.cwd(), inputPath),
    outputPath: path.resolve(process.cwd(), outputPath),
    masterPath: masterPath ? path.resolve(process.cwd(), masterPath) : undefined,
    mdPath: mdPath ? path.resolve(process.cwd(), mdPath) : undefined,
    backupMdPath: backupMdPath ? path.resolve(process.cwd(), backupMdPath) : undefined,
  });
  console.log(`Saved: ${outputPath}`);
}

module.exports = {
  describeDefaultMaster,
  listBuiltInMasters,
  processReview,
  resolveMasterPath,
  DEFAULT_MASTER_ID,
  W_NS,
  loadDocx,
  getXml,
  parseXml,
  childArray,
  getParagraphText,
  getParagraphStyleId,
  buildStyleMap,
};
