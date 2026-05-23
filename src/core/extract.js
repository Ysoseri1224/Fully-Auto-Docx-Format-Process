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

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function getAttr(el, attr) {
  return el ? (el.getAttribute(attr) || null) : null;
}

function getChildEl(parent, ns, tag) {
  if (!parent) return null;
  return parent.getElementsByTagNameNS(ns, tag)[0] || null;
}

function twipsToCm(twips) {
  if (!twips) return null;
  return Math.round((parseInt(twips, 10) / 1440) * 100) / 100;
}

function twipsToPt(twips) {
  if (!twips) return null;
  return Math.round((parseInt(twips, 10) / 20) * 100) / 100;
}

function halfPtToPt(halfPt) {
  if (!halfPt) return null;
  return parseInt(halfPt, 10) / 2;
}

const JC_MAP = {
  left: '左对齐', right: '右对齐', center: '居中',
  both: '两端对齐', distribute: '分散对齐',
};

const LINE_RULE_MAP = {
  auto: '多倍行距', exact: '固定值', atLeast: '最小值',
};

function extractRprProps(rPrEl) {
  if (!rPrEl) return null;
  const props = {};
  const rFonts = getChildEl(rPrEl, W_NS, 'rFonts');
  if (rFonts) {
    const ascii = rFonts.getAttribute('w:ascii') || null;
    const eastAsia = rFonts.getAttribute('w:eastAsia') || null;
    const hAnsi = rFonts.getAttribute('w:hAnsi') || null;
    const cs = rFonts.getAttribute('w:cs') || null;
    if (ascii) props.fontAscii = ascii;
    if (eastAsia) props.fontEastAsia = eastAsia;
    if (hAnsi) props.fontHAnsi = hAnsi;
    if (cs) props.fontCs = cs;
  }
  const sz = getChildEl(rPrEl, W_NS, 'sz');
  if (sz) props.sizePt = halfPtToPt(sz.getAttribute('w:val'));
  const szCs = getChildEl(rPrEl, W_NS, 'szCs');
  if (szCs) props.sizeCsPt = halfPtToPt(szCs.getAttribute('w:val'));
  const b = getChildEl(rPrEl, W_NS, 'b');
  if (b) props.bold = (b.getAttribute('w:val') !== 'false' && b.getAttribute('w:val') !== '0');
  const bCs = getChildEl(rPrEl, W_NS, 'bCs');
  if (bCs) props.boldCs = true;
  const i = getChildEl(rPrEl, W_NS, 'i');
  if (i) props.italic = (i.getAttribute('w:val') !== 'false' && i.getAttribute('w:val') !== '0');
  const iCs = getChildEl(rPrEl, W_NS, 'iCs');
  if (iCs) props.italicCs = true;
  const u = getChildEl(rPrEl, W_NS, 'u');
  if (u) props.underline = u.getAttribute('w:val') || 'single';
  const strike = getChildEl(rPrEl, W_NS, 'strike');
  if (strike) props.strikethrough = true;
  const dstrike = getChildEl(rPrEl, W_NS, 'dstrike');
  if (dstrike) props.doubleStrikethrough = true;
  const color = getChildEl(rPrEl, W_NS, 'color');
  if (color) props.color = color.getAttribute('w:val');
  const highlight = getChildEl(rPrEl, W_NS, 'highlight');
  if (highlight) props.highlight = highlight.getAttribute('w:val');
  const shd = getChildEl(rPrEl, W_NS, 'shd');
  if (shd) props.shading = shd.getAttribute('w:fill') || shd.getAttribute('w:val');
  const vertAlign = getChildEl(rPrEl, W_NS, 'vertAlign');
  if (vertAlign) props.vertAlign = vertAlign.getAttribute('w:val');
  const spacing = getChildEl(rPrEl, W_NS, 'spacing');
  if (spacing) props.charSpacingPt = twipsToPt(spacing.getAttribute('w:val'));
  const kern = getChildEl(rPrEl, W_NS, 'kern');
  if (kern) props.kernPt = halfPtToPt(kern.getAttribute('w:val'));
  const lang = getChildEl(rPrEl, W_NS, 'lang');
  if (lang) {
    props.langVal = lang.getAttribute('w:val') || null;
    props.langEastAsia = lang.getAttribute('w:eastAsia') || null;
  }
  return Object.keys(props).length ? props : null;
}

function extractPprProps(pPrEl) {
  if (!pPrEl) return null;
  const props = {};
  const jc = getChildEl(pPrEl, W_NS, 'jc');
  if (jc) {
    const val = jc.getAttribute('w:val');
    props.alignment = val;
    props.alignmentLabel = JC_MAP[val] || val;
  }
  const ind = getChildEl(pPrEl, W_NS, 'ind');
  if (ind) {
    const left = ind.getAttribute('w:left') || ind.getAttribute('w:start');
    const right = ind.getAttribute('w:right') || ind.getAttribute('w:end');
    const firstLine = ind.getAttribute('w:firstLine');
    const hanging = ind.getAttribute('w:hanging');
    const firstLineChars = ind.getAttribute('w:firstLineChars');
    const leftChars = ind.getAttribute('w:leftChars') || ind.getAttribute('w:startChars');
    const rightChars = ind.getAttribute('w:rightChars') || ind.getAttribute('w:endChars');
    props.indent = {};
    if (left) props.indent.leftTwips = parseInt(left, 10);
    if (left) props.indent.leftCm = twipsToCm(left);
    if (leftChars) props.indent.leftChars = parseInt(leftChars, 10) / 100;
    if (right) props.indent.rightTwips = parseInt(right, 10);
    if (right) props.indent.rightCm = twipsToCm(right);
    if (rightChars) props.indent.rightChars = parseInt(rightChars, 10) / 100;
    if (firstLine) props.indent.firstLineTwips = parseInt(firstLine, 10);
    if (firstLine) props.indent.firstLineCm = twipsToCm(firstLine);
    if (firstLineChars) props.indent.firstLineChars = parseInt(firstLineChars, 10) / 100;
    if (hanging) props.indent.hangingTwips = parseInt(hanging, 10);
    if (hanging) props.indent.hangingCm = twipsToCm(hanging);
  }
  const spacing = getChildEl(pPrEl, W_NS, 'spacing');
  if (spacing) {
    props.spacing = {};
    const before = spacing.getAttribute('w:before');
    const after = spacing.getAttribute('w:after');
    const line = spacing.getAttribute('w:line');
    const lineRule = spacing.getAttribute('w:lineRule');
    const beforeLines = spacing.getAttribute('w:beforeLines');
    const afterLines = spacing.getAttribute('w:afterLines');
    if (before) { props.spacing.beforePt = twipsToPt(before); props.spacing.beforeTwips = parseInt(before, 10); }
    if (after) { props.spacing.afterPt = twipsToPt(after); props.spacing.afterTwips = parseInt(after, 10); }
    if (beforeLines) props.spacing.beforeLines = parseInt(beforeLines, 10) / 100;
    if (afterLines) props.spacing.afterLines = parseInt(afterLines, 10) / 100;
    if (line) {
      const lineVal = parseInt(line, 10);
      const rule = lineRule || 'auto';
      props.spacing.lineRule = rule;
      props.spacing.lineRuleLabel = LINE_RULE_MAP[rule] || rule;
      if (rule === 'auto') {
        props.spacing.lineMultiple = Math.round((lineVal / 240) * 100) / 100;
      } else {
        props.spacing.linePt = twipsToPt(line);
      }
      props.spacing.lineRaw = lineVal;
    }
  }
  const shd = getChildEl(pPrEl, W_NS, 'shd');
  if (shd) {
    props.shading = {
      val: shd.getAttribute('w:val'),
      color: shd.getAttribute('w:color'),
      fill: shd.getAttribute('w:fill'),
      themeFill: shd.getAttribute('w:themeFill'),
    };
  }
  const pBdr = getChildEl(pPrEl, W_NS, 'pBdr');
  if (pBdr) {
    props.borders = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const bdr = getChildEl(pBdr, W_NS, side);
      if (bdr) {
        props.borders[side] = {
          val: bdr.getAttribute('w:val'),
          sz: bdr.getAttribute('w:sz'),
          color: bdr.getAttribute('w:color'),
          space: bdr.getAttribute('w:space'),
        };
      }
    }
  }
  const tabs = getChildEl(pPrEl, W_NS, 'tabs');
  if (tabs) {
    props.tabs = [];
    const tabEls = tabs.getElementsByTagNameNS(W_NS, 'tab');
    for (let i = 0; i < tabEls.length; i++) {
      props.tabs.push({
        val: tabEls[i].getAttribute('w:val'),
        pos: tabEls[i].getAttribute('w:pos'),
        posCm: twipsToCm(tabEls[i].getAttribute('w:pos')),
        leader: tabEls[i].getAttribute('w:leader') || null,
      });
    }
  }
  const keepNext = getChildEl(pPrEl, W_NS, 'keepNext');
  if (keepNext) props.keepNext = true;
  const keepLines = getChildEl(pPrEl, W_NS, 'keepLines');
  if (keepLines) props.keepLines = true;
  const widowControl = getChildEl(pPrEl, W_NS, 'widowControl');
  if (widowControl) {
    const val = widowControl.getAttribute('w:val');
    props.widowControl = val !== '0' && val !== 'false';
  }
  const outlineLvl = getChildEl(pPrEl, W_NS, 'outlineLvl');
  if (outlineLvl) props.outlineLevel = parseInt(outlineLvl.getAttribute('w:val'), 10);
  return Object.keys(props).length ? props : null;
}

function extractSectPr(pEl) {
  const pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  const sectPr = pPr ? getChildEl(pPr, W_NS, 'sectPr') : null;
  if (!sectPr) return null;
  return parseSectPr(sectPr);
}

function parseSectPr(sectPr) {
  if (!sectPr) return null;
  const result = {};
  const pgSz = getChildEl(sectPr, W_NS, 'pgSz');
  if (pgSz) {
    const w = pgSz.getAttribute('w:w');
    const h = pgSz.getAttribute('w:h');
    result.pageSize = {
      widthTwips: w ? parseInt(w, 10) : null,
      heightTwips: h ? parseInt(h, 10) : null,
      widthCm: twipsToCm(w),
      heightCm: twipsToCm(h),
      orient: pgSz.getAttribute('w:orient') || null,
    };
  }
  const pgMar = getChildEl(sectPr, W_NS, 'pgMar');
  if (pgMar) {
    result.margins = {
      topCm: twipsToCm(pgMar.getAttribute('w:top')),
      bottomCm: twipsToCm(pgMar.getAttribute('w:bottom')),
      leftCm: twipsToCm(pgMar.getAttribute('w:left')),
      rightCm: twipsToCm(pgMar.getAttribute('w:right')),
      headerCm: twipsToCm(pgMar.getAttribute('w:header')),
      footerCm: twipsToCm(pgMar.getAttribute('w:footer')),
      gutterCm: twipsToCm(pgMar.getAttribute('w:gutter')),
    };
  }
  const cols = getChildEl(sectPr, W_NS, 'cols');
  if (cols) {
    result.columns = {
      num: parseInt(cols.getAttribute('w:num') || '1', 10),
      space: cols.getAttribute('w:space') || null,
      spaceCm: twipsToCm(cols.getAttribute('w:space')),
    };
  }
  const type = getChildEl(sectPr, W_NS, 'type');
  if (type) result.sectionStart = type.getAttribute('w:val');
  const headerRefs = sectPr.getElementsByTagNameNS(W_NS, 'headerReference');
  if (headerRefs.length) {
    result.headers = [];
    for (let i = 0; i < headerRefs.length; i++) {
      result.headers.push({ type: headerRefs[i].getAttribute('w:type'), rId: headerRefs[i].getAttributeNS(R_NS, 'id') || headerRefs[i].getAttribute('r:id') });
    }
  }
  const footerRefs = sectPr.getElementsByTagNameNS(W_NS, 'footerReference');
  if (footerRefs.length) {
    result.footers = [];
    for (let i = 0; i < footerRefs.length; i++) {
      result.footers.push({ type: footerRefs[i].getAttribute('w:type'), rId: footerRefs[i].getAttributeNS(R_NS, 'id') || footerRefs[i].getAttribute('r:id') });
    }
  }
  const pgNumType = getChildEl(sectPr, W_NS, 'pgNumType');
  if (pgNumType) {
    result.pageNumbering = {
      fmt: pgNumType.getAttribute('w:fmt') || null,
      start: pgNumType.getAttribute('w:start') || null,
    };
  }
  return Object.keys(result).length ? result : null;
}

/**
 * Extract full OOXML format from a paragraph element.
 * Produces a structure matching Word's Shift+F1 "显示格式" panel:
 * - font: { fromDefaults, fromStyle, direct }
 * - paragraph: { fromDefaults, fromStyle, direct }
 * - section: (if sectPr present in this paragraph)
 * - effective: merged computed values
 */
function extractFormat(pEl, styleMap, docDefaults) {
  const styleId = getParagraphStyleId(pEl);

  // Resolve style rPr through basedOn chain
  let resolvedStyleRpr = null;
  let stylePpr = null;
  if (styleId && styleMap.stylesDoc) {
    const styleEls = styleMap.stylesDoc.getElementsByTagNameNS(W_NS, 'style');
    const styleById = {};
    for (let i = 0; i < styleEls.length; i++) {
      styleById[styleEls[i].getAttribute('w:styleId')] = styleEls[i];
    }
    // Walk basedOn chain to collect rPr and pPr
    const rPrChain = [];
    const pPrChain = [];
    let cur = styleId;
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const sEl = styleById[cur];
      if (!sEl) break;
      const rPr = getChildEl(sEl, W_NS, 'rPr');
      if (rPr) rPrChain.push(rPr);
      const pPr = getChildEl(sEl, W_NS, 'pPr');
      if (pPr) pPrChain.push(pPr);
      const basedOn = getChildEl(sEl, W_NS, 'basedOn');
      cur = basedOn ? basedOn.getAttribute('w:val') : null;
    }
    // Merge rPr chain (first = most specific)
    if (rPrChain.length) {
      const merged = {};
      for (let i = rPrChain.length - 1; i >= 0; i--) {
        Object.assign(merged, extractRprProps(rPrChain[i]));
      }
      resolvedStyleRpr = Object.keys(merged).length ? merged : null;
    }
    // Use most specific pPr
    stylePpr = pPrChain[0] || null;
  }

  // Direct pPr on the paragraph (excluding pStyle and numPr)
  const directPpr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0] || null;

  // Direct rPr from first run
  const runs = pEl.getElementsByTagNameNS(W_NS, 'r');
  const directRpr = runs.length ? runs[0].getElementsByTagNameNS(W_NS, 'rPr')[0] : null;

  // Extract each layer
  const fontFromDefaults = docDefaults ? extractRprProps(docDefaults.rPr) : null;
  const fontFromStyle = resolvedStyleRpr;
  const fontDirect = extractRprProps(directRpr);
  const paraFromDefaults = docDefaults ? extractPprProps(docDefaults.pPr) : null;
  const paraFromStyle = extractPprProps(stylePpr);
  const paraDirect = extractPprProps(directPpr);

  // Build effective (merged) values for quick rendering
  const effective = buildEffective(fontFromStyle, fontDirect, paraFromStyle, paraDirect, fontFromDefaults, paraFromDefaults);

  // Section properties (inline sectPr in this paragraph)
  const section = extractSectPr(pEl);

  return {
    font: { fromDefaults: fontFromDefaults, fromStyle: fontFromStyle, direct: fontDirect },
    paragraph: { fromDefaults: paraFromDefaults, fromStyle: paraFromStyle, direct: paraDirect },
    section,
    effective,
  };
}

function buildEffective(fontStyle, fontDirect, paraStyle, paraDirect, fontDefaults, paraDefaults) {
  const eff = {
    fontFamily: null,
    fontSizePt: null,
    bold: false,
    italic: false,
    underline: null,
    strikethrough: false,
    color: null,
    highlight: null,
    shading: null,
    align: 'left',
    firstLineIndentChars: 0,
    leftIndentChars: 0,
    rightIndentChars: 0,
    hangingChars: 0,
    lineSpacing: null,
    lineRule: null,
    spacingBeforePt: 0,
    spacingAfterPt: 0,
    paraShading: null,
    paraBorderBottom: null,
  };
  // Font: direct → style → defaults
  const fEff = fontDirect || fontStyle || fontDefaults || {};
  const fBase = fontStyle || fontDefaults || {};
  const fDef = fontDefaults || {};
  eff.fontFamily = fEff.fontEastAsia || fEff.fontAscii || fEff.fontHAnsi
    || fBase.fontEastAsia || fBase.fontAscii
    || fDef.fontEastAsia || fDef.fontAscii || null;
  eff.fontSizePt = fEff.sizePt || fBase.sizePt || fDef.sizePt || 10.5;
  eff.bold = !!(fEff.bold || fBase.bold);
  eff.italic = !!(fEff.italic || fBase.italic);
  eff.underline = fEff.underline || fBase.underline || null;
  eff.strikethrough = !!(fEff.strikethrough || fBase.strikethrough);
  eff.color = fEff.color || fBase.color || null;
  eff.highlight = fEff.highlight || fBase.highlight || null;
  eff.shading = fEff.shading || fBase.shading || null;
  // Paragraph: direct → style → defaults
  const pEff = paraDirect || {};
  const pBase = paraStyle || paraDefaults || {};
  eff.align = pEff.alignment || pBase.alignment || 'left';
  const ind = pEff.indent || pBase.indent;
  if (ind) {
    eff.firstLineIndentChars = ind.firstLineChars || (ind.firstLineTwips ? ind.firstLineTwips / 240 : 0);
    eff.leftIndentChars = ind.leftChars || (ind.leftCm ? ind.leftCm / 0.635 : 0);
    eff.rightIndentChars = ind.rightChars || (ind.rightCm ? ind.rightCm / 0.635 : 0);
    eff.hangingChars = ind.hangingChars || (ind.hangingCm ? ind.hangingCm / 0.635 : 0);
  }
  const sp = pEff.spacing || pBase.spacing || {};
  eff.spacingBeforePt = sp.beforePt || 0;
  eff.spacingAfterPt = sp.afterPt || 0;
  if (sp.lineRule === 'auto' || (!sp.lineRule && sp.lineMultiple)) {
    eff.lineSpacing = sp.lineMultiple || 1;
    eff.lineRule = 'auto';
  } else if (sp.linePt) {
    eff.lineSpacing = sp.linePt;
    eff.lineRule = sp.lineRule || 'exact';
  }
  // Paragraph shading and borders
  const pShd = pEff.shading || pBase.shading;
  if (pShd && pShd.fill && pShd.fill !== 'auto') {
    eff.paraShading = pShd.fill;
  }
  const pBorders = pEff.borders || pBase.borders;
  if (pBorders && pBorders.bottom) {
    eff.paraBorderBottom = pBorders.bottom;
  }
  return eff;
}

/**
 * Build a stable string key from a format object for clustering.
 */
function buildFormatFingerprint(format) {
  const eff = format.effective || format;
  const parts = [
    eff.fontFamily || '_',
    String(eff.fontSizePt || 0),
    eff.bold ? '1' : '0',
    eff.italic ? '1' : '0',
    eff.align || '_',
    String(eff.firstLineIndentChars || 0),
    String(eff.lineSpacing || 0),
  ];
  return parts.join('|');
}

/**
 * Build a map of styleId → { numId, ilvl } from styles.xml, following basedOn chain.
 */
function buildStyleNumPrMap(stylesDoc) {
  if (!stylesDoc) return {};
  const styleEls = stylesDoc.getElementsByTagNameNS(W_NS, 'style');
  const rawMap = {};
  const basedOnMap = {};

  for (let i = 0; i < styleEls.length; i++) {
    const s = styleEls[i];
    const id = s.getAttribute('w:styleId');
    const basedOn = s.getElementsByTagNameNS(W_NS, 'basedOn')[0];
    if (basedOn) basedOnMap[id] = basedOn.getAttribute('w:val');

    const pPr = s.getElementsByTagNameNS(W_NS, 'pPr')[0];
    if (!pPr) continue;
    const numPr = pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
    if (!numPr) continue;
    const numIdEl = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
    const ilvlEl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
    const numId = numIdEl ? numIdEl.getAttribute('w:val') : null;
    if (numId && numId !== '0') {
      rawMap[id] = { numId, ilvl: ilvlEl ? ilvlEl.getAttribute('w:val') : '0' };
    }
  }

  const resolved = {};
  function resolve(styleId, visited) {
    if (resolved[styleId] !== undefined) return resolved[styleId];
    if (visited.has(styleId)) return null;
    visited.add(styleId);
    if (rawMap[styleId]) {
      resolved[styleId] = rawMap[styleId];
      return rawMap[styleId];
    }
    const parent = basedOnMap[styleId];
    if (parent) {
      const result = resolve(parent, visited);
      resolved[styleId] = result;
      return result;
    }
    resolved[styleId] = null;
    return null;
  }

  for (let i = 0; i < styleEls.length; i++) {
    const id = styleEls[i].getAttribute('w:styleId');
    resolve(id, new Set());
  }
  return resolved;
}

/**
 * Extract numbering info from a paragraph element.
 * Falls back to style-defined numPr if paragraph has no direct numPr.
 */
function extractNumbering(pEl, styleNumPrMap) {
  const pPr = pEl.getElementsByTagNameNS(W_NS, 'pPr')[0];
  let numPr = null;
  if (pPr) {
    const directChildren = pPr.childNodes;
    for (let i = 0; i < directChildren.length; i++) {
      const c = directChildren[i];
      if (c.nodeType === 1 && c.localName === 'numPr') {
        numPr = c;
        break;
      }
    }
  }

  if (numPr) {
    const numIdEl = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
    const ilvlEl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
    const numId = numIdEl ? numIdEl.getAttribute('w:val') : null;
    if (numId && numId !== '0') {
      return {
        numId,
        ilvl: ilvlEl ? ilvlEl.getAttribute('w:val') : '0',
        displayText: null,
      };
    }
    // numId=0 explicitly disables numbering — don't fall through to style
    if (numIdEl) {
      return { numId: null, ilvl: null, displayText: null };
    }
  }

  if (styleNumPrMap) {
    const styleId = getParagraphStyleId(pEl);
    if (styleId && styleNumPrMap[styleId]) {
      return {
        numId: styleNumPrMap[styleId].numId,
        ilvl: styleNumPrMap[styleId].ilvl,
        displayText: null,
      };
    }
  }

  return { numId: null, ilvl: null, displayText: null };
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
function extractParagraphBlock(pEl, index, styleMap, docDefaults, styleNumPrMap) {
  const text = getParagraphText(pEl);
  const id = 'p-' + String(index).padStart(4, '0');

  return {
    id,
    type: 'paragraph',
    role: 'unknown',
    text: text || '',
    styleSource: extractStyleSource(pEl, styleMap),
    numbering: extractNumbering(pEl, styleNumPrMap),
    format: extractFormat(pEl, styleMap, docDefaults),
    location: {
      pageIndex: Math.floor(index / 40),
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
      const pEls = tcEls[j].getElementsByTagNameNS(W_NS, 'p');
      const cellParts = [];
      for (let k = 0; k < pEls.length; k++) {
        cellParts.push(getParagraphText(pEls[k]) || '');
      }
      cells.push(cellParts.join('\n').trim());
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
 * Extract images from VML w:pict elements (older Word format).
 * v:imagedata references images via r:id just like w:drawing.
 */
function extractVmlImagesFromParagraph(pEl, index, relMap, zip) {
  const images = [];
  const picts = pEl.getElementsByTagNameNS(W_NS, 'pict');
  if (!picts.length) return images;

  for (let pi = 0; pi < picts.length; pi++) {
    const pict = picts[pi];
    const imageDatas = pict.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata');
    for (let i = 0; i < imageDatas.length; i++) {
      const im = imageDatas[i];
      const embedId = im.getAttributeNS(R_NS, 'id') || im.getAttribute('r:id');
      const title = im.getAttribute('o:title') || im.getAttribute('title') || '';
      if (!embedId) continue;

      const mediaPath = relMap.get(embedId);
      if (!mediaPath) continue;

      const imgBuf = zip.file(mediaPath);
      if (!imgBuf) continue;

      const base64 = imgBuf.asNodeBuffer().toString('base64');
      const ext = mediaPath.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      const dataUrl = 'data:' + mime + ';base64,' + base64;

      const text = getParagraphText(pEl).trim();
      const id = 'img-' + String(index).padStart(4, '0') + (images.length ? '-' + images.length : '');

      images.push({
        id,
        type: 'image',
        role: 'unknown',
        text: text || title || '(图片)',
        dataUrl,
        mime,
        widthPx: null,
        heightPx: null,
        altText: title || null,
        location: {
          pageIndex: Math.floor(index / 40),
          order: index,
        },
      });
    }
  }

  return images;
}

/**
 * Build a map of relationship ID → media file path from word/_rels/document.xml.rels
 */
function buildImageRelMap(zip) {
  const relsXml = getXml(zip, 'word/_rels/document.xml.rels');
  if (!relsXml) return new Map();

  const relsDoc = parseXml(relsXml);
  const relEls = relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship');
  const map = new Map();

  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i];
    const id = el.getAttribute('Id');
    const type = el.getAttribute('Type');
    const target = el.getAttribute('Target');
    if (id && type && target && type.includes('image')) {
      // target is relative to word/, e.g. "media/image1.png"
      map.set(id, 'word/' + target);
    }
  }

  return map;
}

/**
 * Extract image blocks from a paragraph's w:drawing elements.
 * Returns an array of image block objects (may be empty).
 */
function extractImagesFromParagraph(pEl, index, relMap, zip) {
  const images = [];
  const drawings = pEl.getElementsByTagNameNS(DRAWING_NS, 'inline');
  const anchorDrawings = pEl.getElementsByTagNameNS(DRAWING_NS, 'anchor');

  const allDrawings = [];
  for (let i = 0; i < drawings.length; i++) allDrawings.push({ el: drawings[i], type: 'inline' });
  for (let i = 0; i < anchorDrawings.length; i++) allDrawings.push({ el: anchorDrawings[i], type: 'anchor' });

  for (let i = 0; i < allDrawings.length; i++) {
    const { el: drawingEl } = allDrawings[i];

    // Get extent (dimensions in EMUs) — wp:extent or a:extent
    let extent = drawingEl.getElementsByTagNameNS(DRAWING_NS, 'extent')[0];
    if (!extent) extent = drawingEl.getElementsByTagNameNS(A_NS, 'extent')[0];
    let cx = extent ? extent.getAttribute('cx') : null;
    let cy = extent ? extent.getAttribute('cy') : null;

    // Convert EMU to pixels (1 px = 9525 EMU at 96 DPI)
    const widthPx = cx ? Math.round(parseInt(cx, 10) / 9525) : null;
    const heightPx = cy ? Math.round(parseInt(cy, 10) / 9525) : null;

    // Get alt text / description from docPr
    const docPr = drawingEl.getElementsByTagNameNS(DRAWING_NS, 'docPr')[0];
    const altText = docPr ? (docPr.getAttribute('descr') || docPr.getAttribute('name') || '') : '';

    // Try to get a better caption from surrounding text or parent paragraph
    const parentText = getParagraphText(pEl).trim();

    // Find the blip element with r:embed
    const blips = drawingEl.getElementsByTagNameNS(A_NS, 'blip');
    if (!blips.length) continue;

    const blip = blips[0];
    const embedId = blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed');
    if (!embedId) continue;

    const mediaPath = relMap.get(embedId);
    if (!mediaPath) continue;

    // Read image binary and convert to base64 data URL
    const imgBuf = zip.file(mediaPath);
    if (!imgBuf) continue;

    const base64 = imgBuf.asNodeBuffer().toString('base64');
    const ext = mediaPath.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
    const dataUrl = 'data:' + mime + ';base64,' + base64;

    const text = getParagraphText(pEl).trim();
    const id = 'img-' + String(index).padStart(4, '0') + (i > 0 ? '-' + i : '');

    images.push({
      id,
      type: 'image',
      role: 'unknown',
      text: text || altText || '(图片)',
      dataUrl,
      mime,
      widthPx,
      heightPx,
      altText: altText || null,
      location: {
        pageIndex: Math.floor(index / 40),
        order: index,
      },
    });
  }

  return images;
}

function extractFontTable(zip) {
  const xml = getXml(zip, 'word/fontTable.xml');
  if (!xml) return [];
  const doc = parseXml(xml);
  const fontEls = doc.getElementsByTagNameNS(W_NS, 'font');
  const fonts = [];
  for (let i = 0; i < fontEls.length; i++) {
    const f = fontEls[i];
    const name = f.getAttribute('w:name');
    const family = getChildEl(f, W_NS, 'family');
    const charset = getChildEl(f, W_NS, 'charset');
    fonts.push({
      name,
      family: family ? family.getAttribute('w:val') : null,
      charset: charset ? charset.getAttribute('w:val') : null,
    });
  }
  return fonts;
}

function buildNumberingMap(zip) {
  const xml = getXml(zip, 'word/numbering.xml');
  if (!xml) return null;
  const doc = parseXml(xml);

  const abstractNums = {};
  const absEls = doc.getElementsByTagNameNS(W_NS, 'abstractNum');
  for (let i = 0; i < absEls.length; i++) {
    const absEl = absEls[i];
    const absId = absEl.getAttribute('w:abstractNumId');
    const levels = {};
    const lvlEls = absEl.getElementsByTagNameNS(W_NS, 'lvl');
    for (let j = 0; j < lvlEls.length; j++) {
      const lvl = lvlEls[j];
      const ilvl = lvl.getAttribute('w:ilvl');
      const numFmt = getChildEl(lvl, W_NS, 'numFmt');
      const lvlText = getChildEl(lvl, W_NS, 'lvlText');
      const start = getChildEl(lvl, W_NS, 'start');
      levels[ilvl] = {
        numFmt: numFmt ? numFmt.getAttribute('w:val') : 'decimal',
        lvlText: lvlText ? lvlText.getAttribute('w:val') : '%1.',
        start: start ? parseInt(start.getAttribute('w:val'), 10) : 1,
      };
    }
    abstractNums[absId] = levels;
  }

  const nums = {};
  const numEls = doc.getElementsByTagNameNS(W_NS, 'num');
  for (let i = 0; i < numEls.length; i++) {
    const numEl = numEls[i];
    const numId = numEl.getAttribute('w:numId');
    const absIdEl = numEl.getElementsByTagNameNS(W_NS, 'abstractNumId')[0];
    const absId = absIdEl ? absIdEl.getAttribute('w:val') : null;
    const overrides = {};
    const overrideEls = numEl.getElementsByTagNameNS(W_NS, 'lvlOverride');
    for (let j = 0; j < overrideEls.length; j++) {
      const ov = overrideEls[j];
      const ovIlvl = ov.getAttribute('w:ilvl');
      const startOv = ov.getElementsByTagNameNS(W_NS, 'startOverride')[0];
      if (startOv) overrides[ovIlvl] = parseInt(startOv.getAttribute('w:val'), 10);
    }
    nums[numId] = { abstractNumId: absId, overrides };
  }

  return { abstractNums, nums };
}

function formatNumberValue(counter, numFmt) {
  switch (numFmt) {
    case 'decimal': return String(counter);
    case 'decimalEnclosedCircleChinese': {
      const circles = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
      return counter >= 1 && counter <= 20 ? circles[counter - 1] : String(counter);
    }
    case 'upperLetter': return String.fromCharCode(64 + ((counter - 1) % 26) + 1);
    case 'lowerLetter': return String.fromCharCode(96 + ((counter - 1) % 26) + 1);
    case 'chineseCountingThousand': {
      const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      if (counter <= 10) return digits[counter];
      if (counter < 20) return '十' + (counter % 10 ? digits[counter % 10] : '');
      return String(counter);
    }
    case 'bullet': return '•';
    default: return String(counter);
  }
}

function resolveDisplayText(lvlDef, counters) {
  if (lvlDef.numFmt === 'bullet') return lvlDef.lvlText || '•';
  let text = lvlDef.lvlText || '%1.';
  text = text.replace(/%(\d+)/g, (_, n) => {
    const lvlIdx = parseInt(n, 10) - 1;
    const counter = counters[lvlIdx] || 1;
    return formatNumberValue(counter, lvlDef.numFmt);
  });
  return text;
}

function resolveBlockNumbering(block, numberingMap, numCounters) {
  if (!block.numbering || !block.numbering.numId || !numberingMap) return;
  const { numId, ilvl } = block.numbering;
  const numDef = numberingMap.nums[numId];
  if (!numDef || !numDef.abstractNumId) return;
  const levels = numberingMap.abstractNums[numDef.abstractNumId];
  const ilvlKey = ilvl || '0';
  const lvlDef = levels ? levels[ilvlKey] : null;
  if (!lvlDef) return;

  if (!numCounters[numId]) numCounters[numId] = {};
  if (numDef.overrides[ilvlKey] != null && numCounters[numId][ilvlKey] == null) {
    numCounters[numId][ilvlKey] = numDef.overrides[ilvlKey];
  } else if (numCounters[numId][ilvlKey] == null) {
    numCounters[numId][ilvlKey] = lvlDef.start;
  } else {
    numCounters[numId][ilvlKey]++;
  }

  const currentIlvl = parseInt(ilvlKey, 10);
  for (const key of Object.keys(numCounters[numId])) {
    if (parseInt(key, 10) > currentIlvl) delete numCounters[numId][key];
  }

  const countersArr = [];
  for (let lvl = 0; lvl <= currentIlvl; lvl++) {
    countersArr.push(numCounters[numId][String(lvl)] || 1);
  }

  block.numbering.displayText = resolveDisplayText(lvlDef, countersArr);
  block.numbering.numFmt = lvlDef.numFmt;
  block.numbering.lvlText = lvlDef.lvlText;
}

function extractHeadersFooters(zip, documentSectPr) {
  const result = { headers: [], footers: [] };
  if (!documentSectPr) return result;

  const relsXml = getXml(zip, 'word/_rels/document.xml.rels');
  if (!relsXml) return result;
  const relDoc = parseXml(relsXml);
  const RELS_NS_LOCAL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const rels = relDoc.getElementsByTagNameNS(RELS_NS_LOCAL, 'Relationship');
  const relMap = {};
  for (let i = 0; i < rels.length; i++) {
    relMap[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target');
  }

  function extractHfText(rId) {
    const target = relMap[rId];
    if (!target) return [];
    const xml = getXml(zip, 'word/' + target);
    if (!xml) return [];
    const doc = parseXml(xml);
    const paras = doc.getElementsByTagNameNS(W_NS, 'p');
    const lines = [];
    for (let i = 0; i < paras.length; i++) {
      const t = getParagraphText(paras[i]);
      lines.push(t || '');
    }
    return lines;
  }

  if (documentSectPr.headers) {
    for (const h of documentSectPr.headers) {
      result.headers.push({ type: h.type, lines: extractHfText(h.rId) });
    }
  }
  if (documentSectPr.footers) {
    for (const f of documentSectPr.footers) {
      result.footers.push({ type: f.type, lines: extractHfText(f.rId) });
    }
  }
  return result;
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
    return { blocks: [], styleList: extractStylesSummary(zip), documentSectPr: null, fontTable: [], docDefaults: null };
  }

  // Build docDefaults for font/paragraph fallback
  const docDefaults = {
    rPr: styleMap.docDefaultsRpr || null,
    pPr: styleMap.docDefaultsPpr || null,
  };
  const fontTable = extractFontTable(zip);

  // Extract document-level sectPr (last child of w:body)
  const bodySectPr = getChildEl(body, W_NS, 'sectPr');
  const documentSectPr = parseSectPr(bodySectPr);

  const relMap = buildImageRelMap(zip);
  const numberingMap = buildNumberingMap(zip);
  const styleNumPrMap = buildStyleNumPrMap(styleMap.stylesDoc);
  const numCounters = {};
  const children = childArray(body);
  const blocks = [];
  let blockIndex = 0;

  for (const child of children) {
    if (child.nodeType !== 1) continue;

    if (child.localName === 'p') {
      // Check for drawing images (wp:inline / wp:anchor)
      const hasDrawings = child.getElementsByTagNameNS(DRAWING_NS, 'inline').length ||
                          child.getElementsByTagNameNS(DRAWING_NS, 'anchor').length;
      // Check for VML images (w:pict > v:imagedata)
      const picts = child.getElementsByTagNameNS(W_NS, 'pict');
      let hasVmlImages = false;
      for (let pi = 0; pi < picts.length; pi++) {
        if (picts[pi].getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata').length) {
          hasVmlImages = true;
          break;
        }
      }

      if (hasDrawings) {
        const imgBlocks = extractImagesFromParagraph(child, blockIndex, relMap, zip);
        for (const img of imgBlocks) {
          blocks.push(img);
          blockIndex++;
        }
      }
      if (hasVmlImages) {
        const vmlBlocks = extractVmlImagesFromParagraph(child, blockIndex, relMap, zip);
        for (const img of vmlBlocks) {
          blocks.push(img);
          blockIndex++;
        }
      }

      // Add the paragraph text block if there's text, or if no images were found
      const text = getParagraphText(child);
      if (text) {
        const block = extractParagraphBlock(child, blockIndex, styleMap, docDefaults, styleNumPrMap);
        resolveBlockNumbering(block, numberingMap, numCounters);
        blocks.push(block);
        blockIndex++;
      } else if (!hasDrawings && !hasVmlImages) {
        const block = extractParagraphBlock(child, blockIndex, styleMap, docDefaults, styleNumPrMap);
        resolveBlockNumbering(block, numberingMap, numCounters);
        blocks.push(block);
        blockIndex++;
      }
    } else if (child.localName === 'tbl') {
      blocks.push(extractTableBlock(child, blockIndex, styleMap));
      blockIndex++;
    }
  }

  return {
    blocks,
    styleList: extractStylesSummary(zip),
    documentSectPr,
    fontTable,
    headersFooters: extractHeadersFooters(zip, documentSectPr),
    docDefaults: {
      rPr: extractRprProps(styleMap.docDefaultsRpr),
      pPr: extractPprProps(styleMap.docDefaultsPpr),
    },
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
      clusters.set(fp, { format: block.format, blockIds: [], blocks: [] });
    }
    clusters.get(fp).blockIds.push(block.id);
    clusters.get(fp).blocks.push(block);
  }

  const tempStyles = [];
  let idx = 0;

  for (const [fp, cluster] of clusters) {
    if (cluster.blockIds.length === 0) continue;

    const eff = cluster.format.effective || cluster.format;
    let suggestedRole = 'body';

    const sampleBlock = cluster.blocks[0];
    const hasNumbering = sampleBlock && sampleBlock.numbering && sampleBlock.numbering.numId;
    const isTable = sampleBlock && sampleBlock.type === 'table';
    const styleId = (sampleBlock && sampleBlock.styleSource && sampleBlock.styleSource.styleId) || '';
    const styleLower = styleId.toLowerCase();

    if (isTable) {
      suggestedRole = 'table';
    } else if (eff.bold && eff.fontSizePt >= 22) {
      suggestedRole = 'heading1';
    } else if (eff.bold && eff.fontSizePt >= 16) {
      suggestedRole = 'heading2';
    } else if (eff.bold && eff.fontSizePt >= 14) {
      suggestedRole = 'heading3';
    } else if (eff.align === 'center' && eff.fontSizePt < 14) {
      suggestedRole = 'caption';
    } else if (
      eff.fontFamily &&
      (eff.fontFamily.toLowerCase().includes('consolas') ||
        eff.fontFamily.toLowerCase().includes('courier'))
    ) {
      suggestedRole = 'code';
    } else if (hasNumbering && sampleBlock.numbering.ilvl >= 1) {
      suggestedRole = 'listLevel2';
    } else if (hasNumbering) {
      suggestedRole = 'listLevel1';
    } else if (
      styleLower.includes('note') || styleLower.includes('tip') ||
      styleLower.includes('warning') || styleLower.includes('remark') ||
      (eff.indent && eff.indent.leftPt > 30 && eff.fontSizePt && eff.fontSizePt < 12)
    ) {
      suggestedRole = 'note';
    }

    const id = 'tmp_' + suggestedRole + '_' + String(idx + 1).padStart(2, '0');

    tempStyles.push({
      id,
      suggestedRole,
      format: eff,
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
    if (sorted.length) {
      roleStyleMap[role] = sorted[0][0];
    } else if (assignedBlocks.length > 0) {
      roleStyleMap[role] = `[${role}:${assignedBlocks.length} blocks]`;
    }
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
  buildImageRelMap,
  extractImagesFromParagraph,
  extractVmlImagesFromParagraph,
};
