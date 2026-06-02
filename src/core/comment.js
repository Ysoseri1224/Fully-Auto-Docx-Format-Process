const fs = require('fs');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('xmldom');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function escXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeNode(doc, xml) {
  return new DOMParser().parseFromString(
    `<root xmlns:w="${W_NS}">${xml}</root>`, 'text/xml'
  ).documentElement.firstChild;
}

function getChildElementsByTag(node, tagName) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.tagName === tagName) out.push(c);
  }
  return out;
}

function getDirectText(run) {
  let out = '';
  for (let c = run.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.tagName === 'w:t') out += c.textContent || '';
  }
  return out;
}

function getParagraphRuns(p) {
  return getChildElementsByTag(p, 'w:r');
}

function buildRunProjection(runs) {
  const segments = [];
  let text = '';
  for (const run of runs) {
    const t = getDirectText(run);
    const start = text.length;
    text += t;
    segments.push({ run, start, end: text.length, text: t });
  }
  return { text, segments };
}

function findRunIndexAt(segments, pos) {
  for (let i = 0; i < segments.length; i++) {
    if (pos < segments[i].end) return i;
  }
  return segments.length - 1;
}

function splitRunAt(doc, run, offset) {
  const text = getDirectText(run);
  if (offset <= 0 || offset >= text.length) return run;

  const clone = run.cloneNode(true);
  const leftNodes = getChildElementsByTag(run, 'w:t');
  const rightNodes = getChildElementsByTag(clone, 'w:t');
  if (leftNodes.length !== 1 || rightNodes.length !== 1) {
    return run;
  }

  leftNodes[0].textContent = text.slice(0, offset);
  rightNodes[0].textContent = text.slice(offset);

  if (/^\s|\s$/.test(leftNodes[0].textContent)) {
    leftNodes[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
  if (/^\s|\s$/.test(rightNodes[0].textContent)) {
    rightNodes[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }

  run.parentNode.insertBefore(clone, run.nextSibling);
  return clone;
}

function isolateAtOffset(doc, segments, offset) {
  if (offset <= 0) return;
  const idx = findRunIndexAt(segments, offset);
  const seg = segments[idx];
  if (offset > seg.start && offset < seg.end) {
    const right = splitRunAt(doc, seg.run, offset - seg.start);
    const delta = offset - seg.start;
    segments[idx].text = seg.text.slice(0, delta);
    segments[idx].end = offset;
    segments.splice(idx + 1, 0, {
      run: right,
      start: offset,
      end: seg.start + seg.text.length,
      text: seg.text.slice(delta),
    });
  }
}

function getMaxCommentId(zip) {
  const commentsFile = zip.file('word/comments.xml');
  if (!commentsFile) return -1;
  const xml = commentsFile.asText();
  const matches = xml.match(/w:id="(\d+)"/g);
  if (!matches) return -1;
  return Math.max(...matches.map(m => parseInt(m.match(/\d+/)[0], 10)));
}

function ensureContentTypes(zip) {
  let ct = zip.file('[Content_Types].xml').asText();
  if (!ct.includes('comments.xml')) {
    ct = ct.replace(
      '</Types>',
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>\n</Types>'
    );
  }
  zip.file('[Content_Types].xml', ct);
}

function ensureRelationships(zip) {
  let rels = zip.file('word/_rels/document.xml.rels').asText();
  if (!rels.includes('Target="comments.xml"')) {
    rels = rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>\n</Relationships>'
    );
  }
  zip.file('word/_rels/document.xml.rels', rels);
}

function appendCommentEntry(zip, commentId, text, author) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let newComment = `<w:comment w:id="${commentId}" w:author="${escXml(author)}" w:date="${now}">`;
  const lines = text.split('\n');
  for (const line of lines) {
    newComment += `<w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`;
  }
  newComment += '</w:comment>';

  const existing = zip.file('word/comments.xml');
  if (existing) {
    let xml = existing.asText();
    xml = xml.replace('</w:comments>', newComment + '</w:comments>');
    zip.file('word/comments.xml', xml);
  } else {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += `<w:comments xmlns:w="${W_NS}">`;
    xml += newComment;
    xml += '</w:comments>';
    zip.file('word/comments.xml', xml);
  }
}

function getAllParagraphs(doc) {
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) return [];
  const paras = [];
  for (let c = body.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.localName === 'p') paras.push(c);
  }
  return paras;
}

function wrapSingleParagraph(doc, para, startOffset, endOffset, commentId) {
  const runs = getParagraphRuns(para);
  if (!runs.length) return;

  const projection = buildRunProjection(runs);
  const totalLen = projection.text.length;
  const effEnd = endOffset < 0 ? totalLen : Math.min(endOffset, totalLen);
  const effStart = Math.min(startOffset, effEnd);

  if (effStart >= effEnd) return;

  isolateAtOffset(doc, projection.segments, effEnd);
  isolateAtOffset(doc, projection.segments, effStart);

  const startSeg = projection.segments.find(s => s.start >= effStart && s.start < effEnd);
  const endSeg = [...projection.segments].reverse().find(s => s.start < effEnd && s.end <= effEnd);

  const startNode = makeNode(doc, `<w:commentRangeStart w:id="${commentId}"/>`);
  const endNode = makeNode(doc, `<w:commentRangeEnd w:id="${commentId}"/>`);
  const refRun = makeNode(doc, `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`);

  if (startSeg) {
    para.insertBefore(startNode, startSeg.run);
  }
  if (endSeg) {
    const afterEnd = endSeg.run.nextSibling;
    if (afterEnd) {
      para.insertBefore(endNode, afterEnd);
      para.insertBefore(refRun, afterEnd);
    } else {
      para.appendChild(endNode);
      para.appendChild(refRun);
    }
  }
}

function insertComment(filePath, anchor, text, author) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const docXml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(docXml, 'text/xml');
  const paragraphs = getAllParagraphs(doc);

  const commentId = String(getMaxCommentId(zip) + 1);

  if (anchor.startParaIdx === anchor.endParaIdx) {
    const para = paragraphs[anchor.startParaIdx];
    if (para) {
      wrapSingleParagraph(doc, para, anchor.startCharOffset, anchor.endCharOffset, commentId);
    }
  } else {
    const startPara = paragraphs[anchor.startParaIdx];
    if (startPara) {
      const runs = getParagraphRuns(startPara);
      const projection = buildRunProjection(runs);
      const totalLen = projection.text.length;
      isolateAtOffset(doc, projection.segments, anchor.startCharOffset);
      const seg = projection.segments.find(s => s.start >= anchor.startCharOffset);
      if (seg) {
        startPara.insertBefore(
          makeNode(doc, `<w:commentRangeStart w:id="${commentId}"/>`),
          seg.run
        );
      }
    }

    const endPara = paragraphs[anchor.endParaIdx];
    if (endPara) {
      const runs = getParagraphRuns(endPara);
      const projection = buildRunProjection(runs);
      const totalLen = projection.text.length;
      const effEnd = anchor.endCharOffset < 0 ? totalLen : Math.min(anchor.endCharOffset, totalLen);
      isolateAtOffset(doc, projection.segments, effEnd);
      const endSeg = [...projection.segments].reverse().find(s => s.end <= effEnd);
      const endNode = makeNode(doc, `<w:commentRangeEnd w:id="${commentId}"/>`);
      const refRun = makeNode(doc, `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`);
      if (endSeg) {
        const after = endSeg.run.nextSibling;
        if (after) {
          endPara.insertBefore(endNode, after);
          endPara.insertBefore(refRun, after);
        } else {
          endPara.appendChild(endNode);
          endPara.appendChild(refRun);
        }
      } else {
        endPara.appendChild(endNode);
        endPara.appendChild(refRun);
      }
    }
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  appendCommentEntry(zip, commentId, text, author);
  ensureContentTypes(zip);
  ensureRelationships(zip);
  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return commentId;
}

function deleteComment(filePath, commentId) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const docXml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(docXml, 'text/xml');

  const removeByAttr = (tagName) => {
    const els = doc.getElementsByTagNameNS(W_NS, tagName);
    const toRemove = [];
    for (let i = 0; i < els.length; i++) {
      if (els[i].getAttribute('w:id') === String(commentId)) toRemove.push(els[i]);
    }
    for (const el of toRemove) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  };

  removeByAttr('commentRangeStart');
  removeByAttr('commentRangeEnd');

  const refs = doc.getElementsByTagNameNS(W_NS, 'commentReference');
  const runsToRemove = [];
  for (let i = 0; i < refs.length; i++) {
    if (refs[i].getAttribute('w:id') === String(commentId)) {
      const parentRun = refs[i].parentNode;
      if (parentRun && parentRun.localName === 'r') runsToRemove.push(parentRun);
    }
  }
  for (const run of runsToRemove) {
    if (run.parentNode) run.parentNode.removeChild(run);
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));

  const commentsFile = zip.file('word/comments.xml');
  if (commentsFile) {
    const commentsDoc = new DOMParser().parseFromString(commentsFile.asText(), 'text/xml');
    const commentEls = commentsDoc.getElementsByTagNameNS(W_NS, 'comment');
    for (let i = 0; i < commentEls.length; i++) {
      if (commentEls[i].getAttribute('w:id') === String(commentId)) {
        commentEls[i].parentNode.removeChild(commentEls[i]);
        break;
      }
    }
    zip.file('word/comments.xml', new XMLSerializer().serializeToString(commentsDoc));
  }

  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function editComment(filePath, commentId, newText) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const commentsFile = zip.file('word/comments.xml');
  if (!commentsFile) throw new Error('No comments.xml found');

  const commentsDoc = new DOMParser().parseFromString(commentsFile.asText(), 'text/xml');
  const commentEls = commentsDoc.getElementsByTagNameNS(W_NS, 'comment');
  let target = null;
  for (let i = 0; i < commentEls.length; i++) {
    if (commentEls[i].getAttribute('w:id') === String(commentId)) {
      target = commentEls[i];
      break;
    }
  }
  if (!target) throw new Error('Comment not found: ' + commentId);

  while (target.firstChild) target.removeChild(target.firstChild);
  const lines = newText.split('\n');
  for (const line of lines) {
    const pNode = makeNode(commentsDoc,
      `<w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`
    );
    target.appendChild(pNode);
  }

  zip.file('word/comments.xml', new XMLSerializer().serializeToString(commentsDoc));
  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function batchDeleteComments(filePath, commentIds) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const docXml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(docXml, 'text/xml');

  const idSet = new Set(commentIds.map(String));

  const removeByAttr = (tagName) => {
    const els = doc.getElementsByTagNameNS(W_NS, tagName);
    const toRemove = [];
    for (let i = 0; i < els.length; i++) {
      if (idSet.has(els[i].getAttribute('w:id'))) toRemove.push(els[i]);
    }
    for (const el of toRemove) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  };

  removeByAttr('commentRangeStart');
  removeByAttr('commentRangeEnd');

  const refs = doc.getElementsByTagNameNS(W_NS, 'commentReference');
  const runsToRemove = [];
  for (let i = 0; i < refs.length; i++) {
    if (idSet.has(refs[i].getAttribute('w:id'))) {
      const parentRun = refs[i].parentNode;
      if (parentRun && parentRun.localName === 'r') runsToRemove.push(parentRun);
    }
  }
  for (const run of runsToRemove) {
    if (run.parentNode) run.parentNode.removeChild(run);
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));

  const commentsFile = zip.file('word/comments.xml');
  if (commentsFile) {
    const commentsDoc = new DOMParser().parseFromString(commentsFile.asText(), 'text/xml');
    const commentEls = commentsDoc.getElementsByTagNameNS(W_NS, 'comment');
    const toRemove = [];
    for (let i = 0; i < commentEls.length; i++) {
      if (idSet.has(commentEls[i].getAttribute('w:id'))) toRemove.push(commentEls[i]);
    }
    for (const el of toRemove) el.parentNode.removeChild(el);
    zip.file('word/comments.xml', new XMLSerializer().serializeToString(commentsDoc));
  }

  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function scanRefMarkers(filePath) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const docXml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(docXml, 'text/xml');
  const paragraphs = getAllParagraphs(doc);

  const startPattern = /<!--\s*start:ref:(.+?)\s*-->/g;
  const endPattern = /<!--\s*ref:(.+?)\s*-->/g;

  const starts = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const runs = getParagraphRuns(paragraphs[pi]);
    const { text } = buildRunProjection(runs);
    let m;
    startPattern.lastIndex = 0;
    while ((m = startPattern.exec(text)) !== null) {
      starts.push({ label: m[1].trim(), paraIdx: pi, charOffset: m.index, markerLen: m[0].length });
    }
  }

  const markers = [];
  for (const s of starts) {
    const endRe = new RegExp(`<!--\\s*ref:${s.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`, 'g');
    let found = false;
    for (let pi = s.paraIdx; pi < paragraphs.length && !found; pi++) {
      const runs = getParagraphRuns(paragraphs[pi]);
      const { text } = buildRunProjection(runs);
      endRe.lastIndex = (pi === s.paraIdx) ? s.charOffset + s.markerLen : 0;
      const em = endRe.exec(text);
      if (em) {
        markers.push({
          label: s.label,
          startParaIdx: s.paraIdx,
          startCharOffset: s.charOffset,
          startMarkerLen: s.markerLen,
          endParaIdx: pi,
          endCharOffset: em.index,
          endMarkerLen: em[0].length,
        });
        found = true;
      }
    }
  }
  return markers;
}

function convertRefMarkers(filePath, selectedMarkers, author) {
  selectedMarkers.sort((a, b) => {
    if (a.startParaIdx !== b.startParaIdx) return b.startParaIdx - a.startParaIdx;
    return b.startCharOffset - a.startCharOffset;
  });

  for (const marker of selectedMarkers) {
    const zip = new PizZip(fs.readFileSync(filePath));
    const docXml = zip.file('word/document.xml').asText();
    const doc = new DOMParser().parseFromString(docXml, 'text/xml');
    const paragraphs = getAllParagraphs(doc);

    const commentId = String(getMaxCommentId(zip) + 1);

    const endPara = paragraphs[marker.endParaIdx];
    if (endPara) {
      const runs = getParagraphRuns(endPara);
      const proj = buildRunProjection(runs);
      removeTextRange(doc, proj.segments, marker.endCharOffset, marker.endCharOffset + marker.endMarkerLen);
    }

    const startPara = paragraphs[marker.startParaIdx];
    if (startPara) {
      const runs = getParagraphRuns(startPara);
      const proj = buildRunProjection(runs);
      removeTextRange(doc, proj.segments, marker.startCharOffset, marker.startCharOffset + marker.startMarkerLen);
    }

    const reDoc = new DOMParser().parseFromString(
      new XMLSerializer().serializeToString(doc), 'text/xml'
    );
    const reParas = getAllParagraphs(reDoc);

    const contentStart = marker.startCharOffset;
    const contentEnd = marker.startParaIdx === marker.endParaIdx
      ? marker.endCharOffset - marker.startMarkerLen
      : marker.endCharOffset;

    if (marker.startParaIdx === marker.endParaIdx) {
      const p = reParas[marker.startParaIdx];
      if (p) wrapSingleParagraph(reDoc, p, contentStart, contentEnd, commentId);
    } else {
      const sp = reParas[marker.startParaIdx];
      if (sp) {
        const runs2 = getParagraphRuns(sp);
        const proj2 = buildRunProjection(runs2);
        isolateAtOffset(reDoc, proj2.segments, contentStart);
        const seg = proj2.segments.find(s => s.start >= contentStart);
        if (seg) {
          sp.insertBefore(makeNode(reDoc, `<w:commentRangeStart w:id="${commentId}"/>`), seg.run);
        }
      }
      const ep = reParas[marker.endParaIdx];
      if (ep) {
        const runs2 = getParagraphRuns(ep);
        const proj2 = buildRunProjection(runs2);
        const effEnd = contentEnd < 0 ? proj2.text.length : Math.min(contentEnd, proj2.text.length);
        isolateAtOffset(reDoc, proj2.segments, effEnd);
        const endSeg = [...proj2.segments].reverse().find(s => s.end <= effEnd);
        const endNode = makeNode(reDoc, `<w:commentRangeEnd w:id="${commentId}"/>`);
        const refRun = makeNode(reDoc, `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`);
        if (endSeg) {
          const after = endSeg.run.nextSibling;
          if (after) {
            ep.insertBefore(endNode, after);
            ep.insertBefore(refRun, after);
          } else {
            ep.appendChild(endNode);
            ep.appendChild(refRun);
          }
        }
      }
    }

    const reZip = new PizZip(fs.readFileSync(filePath));
    reZip.file('word/document.xml', new XMLSerializer().serializeToString(reDoc));
    appendCommentEntry(reZip, commentId, marker.label, author);
    ensureContentTypes(reZip);
    ensureRelationships(reZip);
    fs.writeFileSync(filePath, reZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
}

function removeTextRange(doc, segments, from, to) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.end <= from || seg.start >= to) continue;

    const cutStart = Math.max(from, seg.start) - seg.start;
    const cutEnd = Math.min(to, seg.end) - seg.start;

    if (cutStart === 0 && cutEnd === seg.text.length) {
      if (seg.run.parentNode) seg.run.parentNode.removeChild(seg.run);
    } else {
      const newText = seg.text.slice(0, cutStart) + seg.text.slice(cutEnd);
      const tNodes = getChildElementsByTag(seg.run, 'w:t');
      if (tNodes.length === 1) {
        tNodes[0].textContent = newText;
        if (/^\s|\s$/.test(newText)) {
          tNodes[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
        }
      }
    }
  }
}

module.exports = { insertComment, deleteComment, editComment, batchDeleteComments, scanRefMarkers, convertRefMarkers };
