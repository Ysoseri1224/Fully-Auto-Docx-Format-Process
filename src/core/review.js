const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('xmldom');
const embeddedMasterBase64 = require('../generated/embedded-master');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MASTER_CANDIDATES = [
  path.resolve(__dirname, '../../templates/review-master.docx'),
  path.resolve(__dirname, '../templates/review-master.docx'),
];
const DEFAULT_MASTER = MASTER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || MASTER_CANDIDATES[0];

let cachedEmbeddedMasterPath = null;
let cachedExternalizedMasterPath = null;

function ensureEmbeddedMasterFile() {
  if (!embeddedMasterBase64) return null;
  if (cachedEmbeddedMasterPath && fs.existsSync(cachedEmbeddedMasterPath)) return cachedEmbeddedMasterPath;
  const hash = crypto.createHash('sha1').update(embeddedMasterBase64).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), 'writemaster');
  const fp = path.join(dir, `review-master-${hash}.docx`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, Buffer.from(embeddedMasterBase64, 'base64'));
  cachedEmbeddedMasterPath = fp;
  return fp;
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

function resolveMasterPath(masterPath) {
  if (masterPath && fs.existsSync(masterPath)) return externalizeMasterFile(masterPath);
  if (!masterPath && fs.existsSync(DEFAULT_MASTER)) return externalizeMasterFile(DEFAULT_MASTER);
  const embedded = ensureEmbeddedMasterFile();
  if (embedded) return embedded;
  return masterPath || DEFAULT_MASTER;
}

function describeDefaultMaster() {
  if (fs.existsSync(DEFAULT_MASTER)) return DEFAULT_MASTER;
  return 'embedded review-master.docx';
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
  ['word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'word/fontTable.xml', 'word/theme/theme1.xml'].forEach((entry) => {
    const text = getXml(masterZip, entry);
    if (text) targetZip.file(entry, text);
  });
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
  return { stylesDoc, nameToId, styleRpr };
}

function paintRuns(doc, pEl, styleId, styleRpr) {
  const tpl = styleRpr[styleId];
  const runs = pEl.getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.parentNode !== pEl) continue;
    const existing = r.getElementsByTagNameNS(W_NS, 'rPr')[0];
    if (existing) r.removeChild(existing);
    if (tpl) r.insertBefore(importNode(doc, tpl), r.firstChild);
  }
}

function classify(text, currentStyleId, styleIds) {
  if (!text) return null;
  if (text === '应用篇' || /^项目[一二三四五六七八九十0-9]/.test(text)) return '1';
  if (/^\[[^\]]+\]$/.test(text) || /^任务\s*\d+/.test(text) || /^\d+\.\d+\s/.test(text)) return '2';
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
  runs.forEach((r) => pEl.removeChild(r));
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
  if (!match) return;
  const prefix = `${match[1]}${match[2]}`;
  const rest = (match[3] || '').trim();
  setParagraphStyle(doc, pEl, styleId);
  cleanPPr(pEl);
  clearParagraphRuns(pEl);
  pEl.appendChild(makeRun(doc, prefix, styleId, styleRpr, true));
  if (!rest) return;
  const nextP = doc.createElementNS(W_NS, 'w:p');
  setParagraphStyle(doc, nextP, styleId);
  cleanPPr(nextP);
  nextP.appendChild(makeRun(doc, rest, styleId, styleRpr));
  insertAfter(body, pEl, nextP);
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
  return text.replace(/^（\d+）\s*/, '');
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
    mdPath,
    backupMdPath,
  } = options;

  const resolvedMaster = resolveMasterPath(masterPath);
  const masterZip = loadDocx(resolvedMaster);
  const targetZip = loadDocx(inputPath);
  copyMasterPackage(masterZip, targetZip);
  const styleMap = buildStyleMap(targetZip);
  const numberingDoc = getOrCreateNumberingDoc(targetZip);
  const doc = parseXml(getXml(targetZip, 'word/document.xml'));
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const tableMap = parseMarkdownTables(mdPath, backupMdPath);

  const styleIds = {
    body: styleMap.nameToId['正文样式'],
    caption: styleMap.nameToId['图、表标题样式'],
    code: styleMap.nameToId['示例语法格式'],
    note: styleMap.nameToId['提示说明样式'],
    table: styleMap.nameToId['Table Grid'] || 'TableGrid',
  };

  const children = childArray(body);
  const removeNodes = new Set();
  const insertions = [];
  for (const child of children) {
    if (child.nodeType !== 1 || child.localName !== 'p') continue;
    const text = getParagraphText(child);
    if (!text) continue;
    const current = getParagraphStyleId(child);
    const codeLike = isSqlLikeParagraph(text, current);
    const prev = getPreviousParagraph(child);
    const exampleCode = codeLike && prev && isExampleTitle(getParagraphText(prev));
    const targetStyle = exampleCode ? styleIds.body : classify(text, current, styleIds);
    if (targetStyle) {
      setParagraphStyle(doc, child, targetStyle);
      cleanPPr(child);
      paintRuns(doc, child, targetStyle, styleMap.styleRpr);
      if (targetStyle === styleIds.note) splitNoteParagraph(doc, body, child, targetStyle, styleMap.styleRpr);
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
      groupNumId = cloneNum(numberingDoc, 30);
      childNumId = null;
      bodyNumId = null;
      bodyCircledNumId = null;
      continue;
    }
    if (text === '[项目要求]') {
      section = 'require';
      groupNumId = null;
      childNumId = cloneNum(numberingDoc, 31);
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
      childNumId = cloneNum(numberingDoc, 31);
      continue;
    }
    if (section === 'goal' && /^（\d+）/.test(text)) {
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, childNumId);
      continue;
    }
    if (section === 'require' && /^（\d+）/.test(text)) {
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, childNumId);
      continue;
    }
    if (!section && /^（\d+）/.test(text)) {
      if (!bodyNumId) bodyNumId = cloneNum(numberingDoc, 31);
      setParagraphStyle(doc, p, styleIds.body);
      cleanPPr(p);
      paintRuns(doc, p, styleIds.body, styleMap.styleRpr);
      rewriteTextRuns(doc, p, stripLeadingParen(text), styleIds.body, styleMap.styleRpr);
      setNumPr(doc, p, bodyNumId);
      bodyCircledNumId = null;
      continue;
    }
    if (!section && /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)) {
      if (!bodyCircledNumId) bodyCircledNumId = cloneNum(numberingDoc, 10);
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
  DEFAULT_MASTER,
  describeDefaultMaster,
  processReview,
  resolveMasterPath,
};
