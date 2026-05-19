const fs = require('fs');
const PizZip = require('pizzip');
const { DOMParser } = require('xmldom');
const {
  loadDocx,
  getXml,
  parseXml,
  childArray,
  getParagraphText,
  getParagraphStyleId,
  buildStyleMap,
  W_NS,
} = require('./review');

/**
 * Extract the visual format from a paragraph element.
 * Merges style-level rPr defaults with direct formatting on the first run.
 */
function extractFormat(pEl, styleMap) {
  const format = {
    fontFamily: null,
    fontSizePt: null,
    bold: false,
    italic: false,
    align: 'left',
    firstLineIndentChars: 0,
    lineSpacing: 1.15,
  };

  // --- Resolve effective run properties ---
  const styleId = getParagraphStyleId(pEl);
  const styleRpr = styleId ? styleMap.styleRpr[styleId] : null;

  function getVal(el, tag) {
    const node = el ? el.getElementsByTagNameNS(W_NS, tag)[0] : null;
    return node ? node.getAttribute('w:val') : null;
  }

  function hasTag(el, tag) {
    return !!(el && el.getElementsByTagNameNS(W_NS, tag)[0]);
  }

  // Merge: direct rPr on first run overrides style rPr
  const runs = pEl.getElementsByTagNameNS(W_NS, 'r');
  const directRpr = runs.length ? runs[0].getElementsByTagNameNS(W_NS, 'rPr')[0] : null;

  const effectiveRpr = directRpr || styleRpr;

  if (effectiveRpr) {
    // Font family
    const rFonts = effectiveRpr.getElementsByTagNameNS(W_NS, 'rFonts')[0];
    if (rFonts) {
      format.fontFamily =
        rFonts.getAttribute('w:eastAsia') ||
        rFonts.getAttribute('w:ascii') ||
        rFonts.getAttribute('w:hAnsi') ||
        null;
    }

    // Font size (half-points → points)
    const szVal = getVal(effectiveRpr, 'sz') || getVal(effectiveRpr, 'szCs');
    if (szVal) format.fontSizePt = parseInt(szVal, 10) / 2;

    // Bold
    format.bold = hasTag(effectiveRpr, 'b') || hasTag(effectiveRpr, 'bCs');

    // Italic
    format.italic = hasTag(effectiveRpr, 'i') || hasTag(effectiveRpr, 'iCs');
  }

  // If no direct or style rPr found, try styleRpr as fallback for font info
  if (!format.fontFamily && styleRpr) {
    const rFonts = styleRpr.getElementsByTagNameNS(W_NS, 'rFonts')[0];
    if (rFonts) {
      format.fontFamily =
        rFonts.getAttribute('w:eastAsia') ||
        rFonts.getAttribute('w:ascii') ||
        rFonts.getAttribute('w:hAnsi') ||
        null;
    }
    const szVal = getVal(styleRpr, 'sz') || getVal(styleRpr, 'szCs');
    if (szVal && !format.fontSizePt) format.fontSizePt = parseInt(szVal, 10) / 2;
    if (!format.bold) format.bold = hasTag(styleRpr, 'b') || hasTag(styleRpr, 'bCs');
    if (!format.italic) format.italic = hasTag(styleRpr, 'i') || hasTag(styleRpr, 'iCs');
  }

  // --- Paragraph properties ---
  const pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (pPr) {
    // Alignment
    const jc = pPr.getElementsByTagNameNS(W_NS, 'jc')[0];
    if (jc) {
      const jcVal = jc.getAttribute('w:val');
      if (jcVal) format.align = jcVal;
    }

    // Indentation
    const ind = pPr.getElementsByTagNameNS(W_NS, 'ind')[0];
    if (ind) {
      const firstLineChars = parseInt(ind.getAttribute('w:firstLineChars') || '0', 10);
      if (firstLineChars) {
        format.firstLineIndentChars = firstLineChars / 100;
      } else {
        const firstLine = parseInt(ind.getAttribute('w:firstLine') || '0', 10);
        if (firstLine) format.firstLineIndentChars = firstLine / 240; // twips → chars approx
      }
    }

    // Line spacing
    const spacing = pPr.getElementsByTagNameNS(W_NS, 'spacing')[0];
    if (spacing) {
      const line = parseInt(spacing.getAttribute('w:line') || '0', 10);
      if (line) format.lineSpacing = line / 240;
    }
  }

  return format;
}

/**
 * Build a stable string key from a format object for clustering.
 */
function buildFormatFingerprint(format) {
  const parts = [
    format.fontFamily || '_',
    String(format.fontSizePt || 0),
    format.bold ? '1' : '0',
    format.italic ? '1' : '0',
    format.align || '_',
    String(format.firstLineIndentChars || 0),
    String(format.lineSpacing || 0),
  ];
  return parts.join('|');
}

/**
 * Extract numbering info from a paragraph element.
 */
function extractNumbering(pEl) {
  const numPr = pEl.getElementsByTagNameNS(W_NS, 'numPr')[0];
  if (!numPr) return { numId: null, ilvl: null, displayText: null };

  const numIdEl = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
  const ilvlEl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];

  return {
    numId: numIdEl ? numIdEl.getAttribute('w:val') : null,
    ilvl: ilvlEl ? ilvlEl.getAttribute('w:val') : null,
    displayText: null,
  };
}

/**
 * Extract style source info from a paragraph element.
 */
function extractStyleSource(pEl, styleMap) {
  const styleId = getParagraphStyleId(pEl);
  let styleName = null;

  // Reverse lookup: find style name from styleId
  if (styleId && styleMap.nameToId) {
    for (const [name, id] of Object.entries(styleMap.nameToId)) {
      if (id === styleId) {
        styleName = name;
        break;
      }
    }
  }

  // Collect non-style paragraph properties
  const directPPr = {};
  const pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (pPr) {
    for (let i = 0; i < pPr.childNodes.length; i++) {
      const c = pPr.childNodes[i];
      if (c.nodeType !== 1) continue;
      const name = c.localName;
      if (name === 'pStyle' || name === 'numPr') continue;
      const val = c.getAttribute('w:val') || c.textContent || '(inline)';
      directPPr[name] = val;
    }
  }

  // Collect direct run properties from first run
  const directRPr = {};
  const runs = pEl.getElementsByTagNameNS(W_NS, 'r');
  if (runs.length) {
    const rPr = runs[0].getElementsByTagNameNS(W_NS, 'rPr')[0];
    if (rPr) {
      for (let i = 0; i < rPr.childNodes.length; i++) {
        const c = rPr.childNodes[i];
        if (c.nodeType !== 1) continue;
        const name = c.localName;
        const val = c.getAttribute('w:val') || '(present)';
        directRPr[name] = val;
      }
    }
  }

  return {
    styleId: styleId || null,
    styleName,
    directPPr: Object.keys(directPPr).length ? directPPr : null,
    directRPr: Object.keys(directRPr).length ? directRPr : null,
  };
}

/**
 * Extract a single paragraph block from a w:p element.
 */
function extractParagraphBlock(pEl, index, styleMap) {
  const text = getParagraphText(pEl);
  const id = 'p-' + String(index).padStart(4, '0');

  return {
    id,
    type: 'paragraph',
    role: 'unknown',
    text: text || '',
    styleSource: extractStyleSource(pEl, styleMap),
    numbering: extractNumbering(pEl),
    format: extractFormat(pEl, styleMap),
    location: {
      pageIndex: Math.floor(index / 40), // rough estimate: ~40 blocks per page
      order: index,
    },
  };
}

/**
 * Extract a table block from a w:tbl element.
 * Records table structure: rows, cell count, and extracts text from first row as header hint.
 */
function extractTableBlock(tblEl, index, styleMap) {
  const id = 't-' + String(index).padStart(4, '0');
  const rows = [];
  const trEls = tblEl.getElementsByTagNameNS(W_NS, 'tr');
  for (let i = 0; i < trEls.length; i++) {
    const cells = [];
    const tcEls = trEls[i].getElementsByTagNameNS(W_NS, 'tc');
    for (let j = 0; j < tcEls.length; j++) {
      let cellText = '';
      const pEls = tcEls[j].getElementsByTagNameNS(W_NS, 'p');
      for (let k = 0; k < pEls.length; k++) {
        cellText += getParagraphText(pEls[k]) + ' ';
      }
      cells.push(cellText.trim());
    }
    rows.push(cells);
  }

  return {
    id,
    type: 'table',
    role: 'unknown',
    text: rows.length ? rows[0].join(' | ') : '',
    rowCount: rows.length,
    colCount: rows.length ? rows[0].length : 0,
    rows,
    location: {
      pageIndex: Math.floor(index / 40),
      order: index,
    },
  };
}

/**
 * Extract all blocks (paragraphs and tables) from a DOCX file.
 * @param {string} inputPath - Path to the DOCX file
 * @returns {{ blocks: Block[], styleList: Array }}
 */
function extractBlocks(inputPath) {
  const resolved = inputPath;
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const zip = loadDocx(resolved);
  const doc = parseXml(getXml(zip, 'word/document.xml'));
  const styleMap = buildStyleMap(zip);
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];

  if (!body) {
    return { blocks: [], styleList: extractStylesSummary(zip) };
  }

  const children = childArray(body);
  const blocks = [];
  let blockIndex = 0;

  for (const child of children) {
    if (child.nodeType !== 1) continue;

    if (child.localName === 'p') {
      blocks.push(extractParagraphBlock(child, blockIndex, styleMap));
      blockIndex++;
    } else if (child.localName === 'tbl') {
      blocks.push(extractTableBlock(child, blockIndex, styleMap));
      blockIndex++;
    }
  }

  return {
    blocks,
    styleList: extractStylesSummary(zip),
  };
}

/**
 * Extract a summary of all styles defined in the DOCX.
 */
function extractStylesSummary(zip) {
  const xml = getXml(zip, 'word/styles.xml');
  if (!xml) return [];

  const doc = parseXml(xml);
  const styleEls = doc.getElementsByTagNameNS(W_NS, 'style');
  const list = [];

  for (let i = 0; i < styleEls.length; i++) {
    const s = styleEls[i];
    const styleId = s.getAttribute('w:styleId');
    const type = s.getAttribute('w:type') || 'paragraph';
    const nameEl = s.getElementsByTagNameNS(W_NS, 'name')[0];
    const styleName = nameEl ? nameEl.getAttribute('w:val') : null;
    list.push({ styleId, styleName, styleType: type });
  }

  return list;
}

/**
 * Cluster blocks by their format fingerprint into temporary styles.
 */
function clusterBlocks(blocks) {
  const clusters = new Map();

  for (const block of blocks) {
    if (!block.format) continue;
    const fp = buildFormatFingerprint(block.format);
    if (!clusters.has(fp)) {
      clusters.set(fp, { format: block.format, blockIds: [] });
    }
    clusters.get(fp).blockIds.push(block.id);
  }

  const tempStyles = [];
  let idx = 0;

  for (const [fp, cluster] of clusters) {
    if (cluster.blockIds.length === 0) continue;

    const f = cluster.format;
    let suggestedRole = 'body';

    if (f.bold && f.fontSizePt >= 22) suggestedRole = 'heading1';
    else if (f.bold && f.fontSizePt >= 16) suggestedRole = 'heading2';
    else if (f.bold && f.fontSizePt >= 14) suggestedRole = 'heading3';
    else if (f.align === 'center' && f.fontSizePt < 14) suggestedRole = 'caption';
    else if (
      f.fontFamily &&
      (f.fontFamily.toLowerCase().includes('consolas') ||
        f.fontFamily.toLowerCase().includes('courier'))
    )
      suggestedRole = 'code';

    const id = 'tmp_' + suggestedRole + '_' + String(idx + 1).padStart(2, '0');

    tempStyles.push({
      id,
      suggestedRole,
      format: f,
      fingerprint: fp,
      blockCount: cluster.blockIds.length,
      sourceBlockIds: cluster.blockIds,
    });
    idx++;
  }

  tempStyles.sort((a, b) => b.blockCount - a.blockCount);

  return tempStyles;
}

/**
 * Generate a profile from extracted blocks and user-assigned roles.
 */
function generateProfile(blocks, blockRoles, styleList, profileName, sourceTemplate) {
  const roleBlocks = {};

  for (const block of blocks) {
    const role = blockRoles[block.id] || 'unknown';
    if (role === 'ignore' || role === 'unknown') continue;
    if (!roleBlocks[role]) roleBlocks[role] = [];
    roleBlocks[role].push(block);
  }

  const roleStyleMap = {};
  for (const [role, assignedBlocks] of Object.entries(roleBlocks)) {
    const styleIdCounts = {};
    for (const b of assignedBlocks) {
      const sid = b.styleSource?.styleId;
      if (sid) {
        styleIdCounts[sid] = (styleIdCounts[sid] || 0) + 1;
      }
    }
    const sorted = Object.entries(styleIdCounts).sort((a, b) => b[1] - a[1]);
    roleStyleMap[role] = sorted.length ? sorted[0][0] : null;
  }

  const profile = {
    profileName: profileName || 'untitled-profile',
    sourceTemplate: sourceTemplate || '',
    styles: {
      body: roleStyleMap['body'] || null,
      heading1: roleStyleMap['heading1'] || null,
      heading2: roleStyleMap['heading2'] || null,
      heading3: roleStyleMap['heading3'] || null,
      caption: roleStyleMap['caption'] || null,
      code: roleStyleMap['code'] || null,
      note: roleStyleMap['note'] || null,
      table: roleStyleMap['table'] || null,
      listLevel1: roleStyleMap['listLevel1'] || null,
      listLevel2: roleStyleMap['listLevel2'] || null,
    },
    numbering: {},
    patterns: {},
    tableRules: {},
  };

  return profile;
}

module.exports = {
  extractBlocks,
  extractParagraphBlock,
  extractFormat,
  buildFormatFingerprint,
  extractStylesSummary,
  clusterBlocks,
  generateProfile,
};
