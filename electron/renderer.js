const state = {
  activeView: 'landing-view',
  mode: 'md',
  inputPath: '',
  suffix: '',
  selectedMasterId: 'review-master',
  customMasterPath: '',
  pandocPath: '',
  backupMdPath: '',
  runState: 'idle',
  outputMessage: '等待任务执行。',
  lastOutputPath: '',
  masters: [],
  // Extraction state
  masterFilePath: '',
  extractBlocks: [],
  extractStyleList: [],
  documentSectPr: null,
  headersFooters: null,
  selectedBlockId: null,
  blockRoles: {},
  tempStyles: [],
  // Profile state
  profiles: [],
  activeProfileName: null,
  selectedProfileName: '',
  // Context menu state
  rightClickMenuVisible: false,
  rightClickTargetId: null,
  rightClickPosition: { x: 0, y: 0 },
  // Recent files
  recentInputs: [],
  recentMasters: [],
  // Saved temp styles
  savedTempStyles: [],
};

const CUSTOM_MASTER_ID = '__custom__';

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function mapHighlightColor(name) {
  const map = {
    yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff',
    blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080',
    darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000',
    darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
  };
  return map[name] || '#ffff00';
}

const viewMeta = {
  'landing-view': {
    title: 'WriteMaster Workbench',
    mode: '应用任务',
    type: '内置母版',
  },
  'template-view': {
    title: '模板提取工作台',
    mode: '模板提取',
    type: '结构占位',
  },
  'config-view': {
    title: 'Profile 配置',
    mode: '模板配置',
    type: '摘要视图',
  },
};

const el = {
  navButtons: document.querySelectorAll('[data-view-target]'),
  views: document.querySelectorAll('.view'),
  tabs: document.querySelectorAll('.tab[data-view-target]'),
  navItems: document.querySelectorAll('.nav-item[data-view-target]'),
  toolbarTitle: document.getElementById('toolbarTitle'),
  modeTag: document.getElementById('modeTag'),
  typeTag: document.getElementById('typeTag'),
  toolbarMasterTag: document.getElementById('toolbarMasterTag'),
  statusLeft: document.getElementById('statusLeft'),
  statusMid: document.getElementById('statusMid'),
  statusRight: document.getElementById('statusRight'),
  mode: document.getElementById('mode'),
  inputPath: document.getElementById('inputPath'),
  suffix: document.getElementById('suffix'),
  masterSelect: document.getElementById('masterSelect'),
  customMasterRow: document.getElementById('customMasterRow'),
  customMasterPath: document.getElementById('customMasterPath'),
  pandocPath: document.getElementById('pandocPath'),
  backupMdPath: document.getElementById('backupMdPath'),
  chooseFile: document.getElementById('chooseFile'),
  pickCustomMaster: document.getElementById('pickCustomMaster'),
  chooseMasterFile: document.getElementById('chooseMasterFile'),
  primaryAction: document.getElementById('primaryAction'),
  run: document.getElementById('run'),
  resetTask: document.getElementById('resetTask'),
  output: document.getElementById('output'),
  masterCards: document.getElementById('masterCards'),
  refreshMasters: document.getElementById('refreshMasters'),
  selectedMasterName: document.getElementById('selectedMasterName'),
  selectedMasterDesc: document.getElementById('selectedMasterDesc'),
  selectedMasterKind: document.getElementById('selectedMasterKind'),
  selectedMasterSource: document.getElementById('selectedMasterSource'),
  templateMasterJson: document.getElementById('templateMasterJson'),
  stateJson: document.getElementById('state-json-content'),
  lastOutput: document.getElementById('lastOutput'),
  currentMasterMeta: document.getElementById('currentMasterMeta'),
  currentModeMeta: document.getElementById('currentModeMeta'),
  rightTopTabs: document.querySelectorAll('#inspectorTabs [data-tab-target]'),
  inspectorPanels: document.querySelectorAll('.inspector-panel'),
  // Extraction UI elements
  extractUpload: document.getElementById('extract-upload'),
  extractResult: document.getElementById('extract-result'),
  blockPreview: document.getElementById('blockPreview'),
  contextMenu: document.getElementById('contextMenu'),
  pickMasterForExtract: document.getElementById('pickMasterForExtract'),
  // Profile panels (P4/P5)
  profileGenPanel: document.getElementById('profileGenPanel'),
  profileName: document.getElementById('profileName'),
  roleSummary: document.getElementById('roleSummary'),
  roleChips: document.getElementById('roleChips'),
  clusterBtn: document.getElementById('clusterBtn'),
  generateProfileBtn: document.getElementById('generateProfileBtn'),
  inspectorTempStyleList: document.getElementById('inspectorTempStyleList'),
  profileSelect: document.getElementById('profileSelect'),
  // P5 Profile config elements
  profileList: document.getElementById('profileList'),
  noProfilesNote: document.getElementById('noProfilesNote'),
  importProfileBtn: document.getElementById('importProfileBtn'),
  exportProfileBtn: document.getElementById('exportProfileBtn'),
  deleteProfileBtn: document.getElementById('deleteProfileBtn'),
  profileEditor: document.getElementById('profileEditor'),
  profileEditorTitle: document.getElementById('profileEditorTitle'),
  editProfileName: document.getElementById('editProfileName'),
  editSourceTemplate: document.getElementById('editSourceTemplate'),
  styleMappingList: document.getElementById('styleMappingList'),
  cancelEditProfile: document.getElementById('cancelEditProfile'),
  saveEditProfile: document.getElementById('saveEditProfile'),
  recentFiles: document.getElementById('recentFiles'),
  aboutBtn: document.getElementById('aboutBtn'),
  inspectorMasterSummary: document.getElementById('inspectorMasterSummary'),
  summaryResultBox: document.getElementById('summaryResultBox'),
  formatTree: document.getElementById('state-format-content'),
  stateSubTabs: document.querySelectorAll('#stateSubTabs [data-state-sub]'),
  stateJsonContent: document.getElementById('state-json-content'),
  stateFormatContent: document.getElementById('state-format-content'),
  tempStyleName: document.getElementById('tempStyleName'),
  saveAsTempStyle: document.getElementById('saveAsTempStyle'),
  savedTempStyleList: document.getElementById('savedTempStyleList'),
  importOtherTemplate: document.getElementById('importOtherTemplate'),
};

function getSelectedMaster() {
  return state.masters.find((master) => master.id === state.selectedMasterId) || null;
}

function isCustomMasterSelected() {
  return state.selectedMasterId === CUSTOM_MASTER_ID;
}

function getCurrentMasterLabel() {
  if (isCustomMasterSelected()) return state.customMasterPath || '自定义外部母版';
  return getSelectedMaster()?.id || 'review-master';
}

function setActiveView(viewId) {
  state.activeView = viewId;
  render();
}

function setRunState(runState, outputMessage) {
  state.runState = runState;
  state.outputMessage = outputMessage;
  if (runState === 'success' || runState === 'error') {
    switchInspectorTab('tab-summary');
  }
  render();
}

function switchInspectorTab(tabId) {
  el.rightTopTabs.forEach((x) => x.classList.toggle('active', x.dataset.tabTarget === tabId));
  el.inspectorPanels.forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function masterOptionList() {
  return [
    ...state.masters.map((master) => ({ value: master.id, label: `${master.label}${master.isDefault ? '（默认）' : ''}` })),
    { value: CUSTOM_MASTER_ID, label: '自定义外部母版…' },
  ];
}

function renderMasterSelect() {
  const current = state.selectedMasterId;
  el.masterSelect.innerHTML = '';
  for (const option of masterOptionList()) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === current) node.selected = true;
    el.masterSelect.appendChild(node);
  }
}

function renderMasterCards() {
  el.masterCards.innerHTML = '';
  for (const master of state.masters) {
    const card = document.createElement('button');
    card.className = `card${state.selectedMasterId === master.id ? ' active' : ''}`;
    card.type = 'button';
    card.dataset.masterId = master.id;
    card.innerHTML = `
      <div class="card-title">${master.label}</div>
      <div class="card-sub">${master.description}</div>
      <div class="card-sub">${master.kind}${master.isDefault ? ' / default' : ''}</div>
    `;
    card.addEventListener('click', async () => {
      if (state.activeView === 'template-view') {
        await loadMasterForExtract(master.id);
      } else {
        state.selectedMasterId = master.id;
        render();
      }
    });
    el.masterCards.appendChild(card);
  }
}

function renderSavedTempStyles() {
  if (!el.savedTempStyleList) return;
  el.savedTempStyleList.innerHTML = '';
  if (!state.savedTempStyles.length) {
    el.savedTempStyleList.innerHTML = '<div class="muted">尚未保存任何临时样式。</div>';
    return;
  }
  for (const ts of state.savedTempStyles) {
    const item = document.createElement('div');
    item.className = 'style-item';
    const fmt = ts.format || {};
    item.innerHTML = `
      <div class="style-name">${ts.name}</div>
      <div class="style-meta">${fmt.fontFamily || '?'} ${fmt.fontSizePt || '?'}pt${fmt.bold ? ' 加粗' : ''}${fmt.italic ? ' 倾斜' : ''} / ${fmt.align || 'left'}</div>
      <button class="button secondary" style="padding:2px 8px;font-size:11px;margin-top:4px;" data-delete-style="${ts.name}">删除</button>
    `;
    item.querySelector('[data-delete-style]').addEventListener('click', async (e) => {
      e.stopPropagation();
      state.savedTempStyles = state.savedTempStyles.filter(s => s.name !== ts.name);
      await window.writemaster.saveTempStyles(state.savedTempStyles);
      render();
    });
    el.savedTempStyleList.appendChild(item);
  }
}

function renderViewMeta() {
  const meta = viewMeta[state.activeView];
  el.toolbarTitle.textContent = meta.title;
  el.modeTag.textContent = meta.mode;
  el.typeTag.textContent = meta.type;
  const inTemplate = state.activeView === 'template-view' && state.masterFilePath;
  el.toolbarMasterTag.style.display = inTemplate ? 'none' : '';
  el.importOtherTemplate.style.display = inTemplate ? '' : 'none';
}

function renderVisibility() {
  el.views.forEach((view) => view.classList.toggle('active', view.id === state.activeView));
  el.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.viewTarget === state.activeView));
  el.navItems.forEach((item) => item.classList.toggle('active', item.dataset.viewTarget === state.activeView));
  const showCustom = isCustomMasterSelected();
  el.customMasterRow.classList.toggle('hidden', !showCustom);
  el.chooseMasterFile.classList.toggle('hidden', !showCustom);
}

function renderFormValues() {
  el.mode.value = state.mode;
  el.inputPath.value = state.inputPath;
  el.suffix.value = state.suffix;
  el.customMasterPath.value = state.customMasterPath;
  el.pandocPath.value = state.pandocPath;
  el.backupMdPath.value = state.backupMdPath;
}

function renderOutput() {
  el.output.textContent = state.outputMessage;
  el.output.className = 'result-box';
  if (state.runState === 'success') el.output.classList.add('success');
  if (state.runState === 'error') el.output.classList.add('error');
}

function renderMasterSummary() {
  const master = getSelectedMaster();
  if (isCustomMasterSelected()) {
    el.selectedMasterName.textContent = '自定义外部母版';
    el.selectedMasterDesc.textContent = state.customMasterPath || '尚未选择外部 DOCX 母版。';
    el.selectedMasterKind.textContent = 'kind: external';
    el.selectedMasterSource.textContent = 'source: custom path';
    if (el.templateMasterJson) {
      el.templateMasterJson.textContent = JSON.stringify({
        id: CUSTOM_MASTER_ID,
        customMasterPath: state.customMasterPath || null,
        sourceType: 'custom',
      }, null, 2);
    }
    el.currentMasterMeta.textContent = state.customMasterPath
      ? `${state.customMasterPath} / custom`
      : '外部母版 / 未选择';
  } else if (master) {
    el.selectedMasterName.textContent = master.label;
    el.selectedMasterDesc.textContent = master.description;
    el.selectedMasterKind.textContent = `kind: ${master.kind}`;
    el.selectedMasterSource.textContent = `source: ${master.sourceType}`;
    if (el.templateMasterJson) {
      el.templateMasterJson.textContent = JSON.stringify(master, null, 2);
    }
    el.currentMasterMeta.textContent = `${master.id} / ${master.sourceType}`;
  }
  el.toolbarMasterTag.textContent = `当前母版：${getCurrentMasterLabel()}`;
}

function renderStatus() {
  el.statusLeft.textContent = `当前视图：${viewMeta[state.activeView].mode}`;
  el.statusMid.textContent = `当前母版：${getCurrentMasterLabel()}`;
  el.statusRight.textContent = state.lastOutputPath ? `最近输出：${state.lastOutputPath}` : '尚未生成输出';
  el.lastOutput.textContent = state.lastOutputPath || '尚未生成';
  el.currentModeMeta.textContent = state.mode === 'md' ? 'Markdown → DOCX' : 'DOCX 整理输出';
  if (el.currentMasterMeta) el.currentMasterMeta.textContent = `${getCurrentMasterLabel()} / ${isCustomMasterSelected() ? 'custom' : 'built-in'}`;

  // Populate summary-master panel
  if (el.inspectorMasterSummary) {
    const master = getSelectedMaster();
    if (isCustomMasterSelected()) {
      el.inspectorMasterSummary.innerHTML = `
        <div class="config-item"><div class="config-name">来源</div><div class="config-meta">外部文件</div></div>
        <div class="config-item"><div class="config-name">路径</div><div class="config-meta" style="word-break:break-all;font-size:12px;">${state.customMasterPath || '未选择'}</div></div>
      `;
    } else if (master) {
      el.inspectorMasterSummary.innerHTML = `
        <div class="config-item"><div class="config-name">ID</div><div class="config-meta">${master.id}</div></div>
        <div class="config-item"><div class="config-name">名称</div><div class="config-meta">${master.label}</div></div>
        <div class="config-item"><div class="config-name">类型</div><div class="config-meta">${master.kind}</div></div>
        <div class="config-item"><div class="config-name">来源</div><div class="config-meta">${master.sourceType}</div></div>
        <div class="config-item"><div class="config-name">描述</div><div class="config-meta">${master.description}</div></div>
        ${state.activeView === 'template-view' && state.extractBlocks.length ? `<div class="config-item"><div class="config-name">已提取块</div><div class="config-meta">${state.extractBlocks.length} 个</div></div>` : ''}
      `;
    } else {
      el.inspectorMasterSummary.innerHTML = '<div class="muted">选择母版后显示摘要。</div>';
    }
  }

  // Populate summary-result panel
  if (el.summaryResultBox) {
    const cls = state.runState === 'success' ? 'success' : state.runState === 'error' ? 'error' : '';
    el.summaryResultBox.textContent = state.outputMessage;
    el.summaryResultBox.className = 'result-box';
    if (cls) el.summaryResultBox.classList.add(cls);
  }
}

function renderStateJson() {
  el.stateJson.textContent = JSON.stringify({
    activeView: state.activeView,
    mode: state.mode,
    inputPath: state.inputPath,
    suffix: state.suffix || null,
    selectedMasterId: state.selectedMasterId,
    customMasterPath: state.customMasterPath || null,
    pandocPath: state.pandocPath || null,
    backupMdPath: state.backupMdPath || null,
    runState: state.runState,
    lastOutputPath: state.lastOutputPath || null,
  }, null, 2);
}

function renderExtractUpload() {
  const hasMaster = !!state.masterFilePath;
  if (el.extractUpload) el.extractUpload.classList.toggle('hidden', hasMaster);
  if (el.extractResult) {
    el.extractResult.style.display = hasMaster ? 'flex' : 'none';
  }
}

function renderBlockPreview() {
  if (!el.blockPreview) return;
  el.blockPreview.innerHTML = '';
  if (!state.extractBlocks.length) {
    el.blockPreview.innerHTML = '<div class="muted" style="padding:40px;text-align:center;">没有检测到段落块。</div>';
    return;
  }

  // Render header
  if (state.headersFooters && state.headersFooters.headers.length) {
    const defaultH = state.headersFooters.headers.find(h => h.type === 'default') || state.headersFooters.headers[0];
    if (defaultH && defaultH.lines.some(l => l)) {
      const hDiv = document.createElement('div');
      hDiv.className = 'block-hf block-header';
      hDiv.textContent = defaultH.lines.filter(l => l).join(' | ') || '(页眉 - 仅含域代码)';
      el.blockPreview.appendChild(hDiv);
    } else {
      const hDiv = document.createElement('div');
      hDiv.className = 'block-hf block-header';
      hDiv.textContent = '(页眉 - 仅含域代码/页码)';
      el.blockPreview.appendChild(hDiv);
    }
  }

  for (const block of state.extractBlocks) {
    const div = document.createElement('div');
    div.className = 'block';
    div.dataset.blockId = block.id;
    const numPrefix = block.numbering && block.numbering.displayText ? block.numbering.displayText + ' ' : '';
    div.textContent = numPrefix + (block.text || '(空段落)');

    const role = state.blockRoles[block.id] || 'unknown';
    if (role !== 'unknown') {
      div.classList.add(role);
    } else if (block.styleSource && block.styleSource.styleName) {
      const sn = block.styleSource.styleName.toLowerCase();
      if (sn.includes('heading 1')) div.classList.add('heading1');
      else if (sn.includes('heading 2')) div.classList.add('heading2');
      else if (sn.includes('heading 3')) div.classList.add('heading3');
    }

    if (block.type === 'table') {
      div.classList.add('table');
      if (block.rows && block.rows.length) {
        div.textContent = '';
        const table = document.createElement('table');
        table.className = 'block-table';
        block.rows.forEach((row, ri) => {
          const tr = document.createElement('tr');
          row.forEach(cell => {
            const td = document.createElement(ri === 0 ? 'th' : 'td');
            td.textContent = cell;
            tr.appendChild(td);
          });
          table.appendChild(tr);
        });
        div.appendChild(table);
      }
    }
    if (block.type === 'image') {
      div.classList.add('image');
      div.textContent = '';
      const img = document.createElement('img');
      img.src = block.dataUrl;
      img.alt = block.altText || block.text || '';
      img.title = block.text || '';
      if (block.widthPx) img.style.maxWidth = Math.min(block.widthPx, 700) + 'px';
      img.style.display = 'block';
      img.style.margin = '0 auto';
      div.appendChild(img);
      const caption = document.createElement('div');
      caption.className = 'image-caption';
      caption.textContent = block.text || block.altText || '';
      div.appendChild(caption);
    }

    // Apply actual DOCX computed styles for paragraph blocks
    if (block.type === 'paragraph' && block.format && block.format.effective) {
      const eff = block.format.effective;
      if (eff.fontFamily) div.style.fontFamily = eff.fontFamily + ', serif';
      if (eff.fontSizePt) div.style.fontSize = eff.fontSizePt + 'pt';
      if (eff.bold) div.style.fontWeight = '700';
      if (eff.italic) div.style.fontStyle = 'italic';
      if (eff.underline) div.style.textDecoration = 'underline';
      if (eff.strikethrough) div.style.textDecoration = (div.style.textDecoration || '') + ' line-through';
      if (eff.color && eff.color !== 'auto') div.style.color = '#' + eff.color;
      if (eff.highlight) div.style.backgroundColor = mapHighlightColor(eff.highlight);
      if (eff.shading && eff.shading !== 'auto') div.style.backgroundColor = '#' + eff.shading;
      if (eff.paraShading) div.style.backgroundColor = '#' + eff.paraShading;
      if (eff.paraBorderBottom) div.style.borderBottom = '1px solid #999';
      if (eff.align) {
        const alignMap = { left: 'left', right: 'right', center: 'center', both: 'justify', distribute: 'justify' };
        div.style.textAlign = alignMap[eff.align] || 'left';
      }
      if (eff.firstLineIndentChars > 0) div.style.textIndent = eff.firstLineIndentChars + 'em';
      if (eff.leftIndentChars > 0) div.style.paddingLeft = eff.leftIndentChars + 'em';
      if (eff.rightIndentChars > 0) div.style.paddingRight = eff.rightIndentChars + 'em';
      if (eff.hangingChars > 0) {
        div.style.textIndent = '-' + eff.hangingChars + 'em';
        div.style.paddingLeft = (eff.leftIndentChars + eff.hangingChars) + 'em';
      }
      if (eff.lineSpacing) {
        if (eff.lineRule === 'auto') {
          div.style.lineHeight = String(eff.lineSpacing);
        } else {
          div.style.lineHeight = eff.lineSpacing + 'pt';
        }
      }
      if (eff.spacingBeforePt) div.style.marginTop = eff.spacingBeforePt + 'pt';
      if (eff.spacingAfterPt) div.style.marginBottom = eff.spacingAfterPt + 'pt';
    }

    if (block.id === state.selectedBlockId) div.classList.add('selected');

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedBlockId = block.id;
      render();
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.rightClickTargetId = block.id;
      state.rightClickPosition = { x: e.clientX, y: e.clientY };
      state.rightClickMenuVisible = true;
      render();
    });

    el.blockPreview.appendChild(div);
  }

  // Render footer
  if (state.headersFooters && state.headersFooters.footers.length) {
    const defaultF = state.headersFooters.footers.find(f => f.type === 'default') || state.headersFooters.footers[0];
    if (defaultF && defaultF.lines.some(l => l)) {
      const fDiv = document.createElement('div');
      fDiv.className = 'block-hf block-footer';
      fDiv.textContent = defaultF.lines.filter(l => l).join(' | ') || '(页脚 - 仅含域代码)';
      el.blockPreview.appendChild(fDiv);
    } else {
      const fDiv = document.createElement('div');
      fDiv.className = 'block-hf block-footer';
      fDiv.textContent = '(页脚 - 仅含域代码/页码)';
      el.blockPreview.appendChild(fDiv);
    }
  }
}

function renderContextMenu() {
  if (!el.contextMenu) return;
  if (state.rightClickMenuVisible) {
    el.contextMenu.style.left = state.rightClickPosition.x + 'px';
    el.contextMenu.style.top = state.rightClickPosition.y + 'px';
    el.contextMenu.classList.remove('hidden');
  } else {
    el.contextMenu.classList.add('hidden');
  }
}

function renderBlockInspector() {
  if (state.selectedBlockId && state.extractBlocks.length) {
    const block = state.extractBlocks.find(b => b.id === state.selectedBlockId);
    if (block) {
      el.stateJson.textContent = JSON.stringify(block, null, 2);
      if (el.templateMasterJson) {
        el.templateMasterJson.textContent = JSON.stringify(block, null, 2);
      }
    }
  }
}

function renderFormatPanel() {
  if (!el.formatTree) return;
  if (!state.selectedBlockId || !state.extractBlocks.length) {
    el.formatTree.innerHTML = '<div class="muted">选中一个段落块后显示其完整格式信息。</div>';
    return;
  }
  const block = state.extractBlocks.find(b => b.id === state.selectedBlockId);
  if (!block || !block.format) {
    el.formatTree.innerHTML = '<div class="ft-empty">该块无格式信息。</div>';
    return;
  }
  const fmt = block.format;
  let html = '';

  // Style source
  if (block.styleSource) {
    html += '<div class="ft-section">';
    html += '<div class="ft-header">段落样式</div>';
    if (block.styleSource.styleId) {
      html += ftRow('样式 ID', block.styleSource.styleId);
    }
    if (block.styleSource.styleName) {
      html += ftRow('样式名称', block.styleSource.styleName);
    }
    html += '</div>';
  }

  // Font section
  html += '<div class="ft-section">';
  html += '<div class="ft-header">字体</div>';
  const fontStyle = fmt.font?.fromStyle;
  const fontDirect = fmt.font?.direct;
  if (fontStyle || fontDirect) {
    if (fontStyle) {
      html += ftSubHeader('从段落样式');
      html += renderRprSection(fontStyle);
    }
    if (fontDirect) {
      html += ftSubHeader('直接格式');
      html += renderRprSection(fontDirect);
    }
  } else {
    html += '<div class="ft-empty">无字体格式信息</div>';
  }
  html += '</div>';

  // Paragraph section
  html += '<div class="ft-section">';
  html += '<div class="ft-header">段落</div>';
  const paraStyle = fmt.paragraph?.fromStyle;
  const paraDirect = fmt.paragraph?.direct;
  if (paraStyle || paraDirect) {
    if (paraStyle) {
      html += ftSubHeader('从段落样式');
      html += renderPprSection(paraStyle);
    }
    if (paraDirect) {
      html += ftSubHeader('直接格式');
      html += renderPprSection(paraDirect);
    }
  } else {
    html += '<div class="ft-empty">无段落格式信息</div>';
  }
  html += '</div>';

  // Section properties
  const sectPr = fmt.section || state.documentSectPr;
  if (sectPr) {
    html += '<div class="ft-section">';
    html += '<div class="ft-header">节</div>';
    html += renderSectPrSection(sectPr, !!fmt.section);
    html += '</div>';
  }

  el.formatTree.innerHTML = html;
}

function ftRow(label, value, source) {
  const srcTag = source ? `<span class="ft-source">${source}</span>` : '';
  return `<div class="ft-row"><span class="ft-label">${label}</span><span class="ft-value">${value}${srcTag}</span></div>`;
}

function ftSubHeader(text) {
  return `<div style="font-size:12px;color:#7c6958;margin:6px 0 2px;font-weight:600;">${text}</div>`;
}

function renderRprSection(rpr) {
  let html = '<div class="ft-sub">';
  if (rpr.fontEastAsia || rpr.fontAscii || rpr.fontHAnsi || rpr.fontCs) {
    const fonts = [];
    if (rpr.fontEastAsia) fonts.push('中文: ' + rpr.fontEastAsia);
    if (rpr.fontAscii) fonts.push('西文: ' + rpr.fontAscii);
    if (rpr.fontHAnsi) fonts.push('hAnsi: ' + rpr.fontHAnsi);
    if (rpr.fontCs) fonts.push('复杂文种: ' + rpr.fontCs);
    html += ftRow('字体', fonts.join('，'));
  }
  if (rpr.sizePt) html += ftRow('字号', rpr.sizePt + ' 磅');
  if (rpr.sizeCsPt) html += ftRow('复杂文种字号', rpr.sizeCsPt + ' 磅');
  if (rpr.bold) html += ftRow('加粗', '是');
  if (rpr.boldCs) html += ftRow('加粗(复杂文种)', '是');
  if (rpr.italic) html += ftRow('倾斜', '是');
  if (rpr.italicCs) html += ftRow('倾斜(复杂文种)', '是');
  if (rpr.underline) html += ftRow('下划线', rpr.underline);
  if (rpr.strikethrough) html += ftRow('删除线', '是');
  if (rpr.doubleStrikethrough) html += ftRow('双删除线', '是');
  if (rpr.color) html += ftRow('字体颜色', rpr.color === 'auto' ? '自动' : '#' + rpr.color);
  if (rpr.highlight) html += ftRow('突出显示', rpr.highlight);
  if (rpr.shading) html += ftRow('底纹', rpr.shading);
  if (rpr.vertAlign) html += ftRow('垂直对齐', rpr.vertAlign === 'superscript' ? '上标' : rpr.vertAlign === 'subscript' ? '下标' : rpr.vertAlign);
  if (rpr.charSpacingPt) html += ftRow('字符间距', rpr.charSpacingPt + ' 磅');
  if (rpr.kernPt) html += ftRow('字距调整', rpr.kernPt + ' 磅及以上');
  if (rpr.langVal || rpr.langEastAsia) {
    const parts = [];
    if (rpr.langVal) parts.push(rpr.langVal);
    if (rpr.langEastAsia) parts.push('东亚: ' + rpr.langEastAsia);
    html += ftRow('语言', parts.join('，'));
  }
  html += '</div>';
  return html;
}

function renderPprSection(ppr) {
  let html = '<div class="ft-sub">';
  if (ppr.alignment) {
    html += ftRow('对齐方式', ppr.alignmentLabel || ppr.alignment);
  }
  if (ppr.indent) {
    const ind = ppr.indent;
    if (ind.leftCm != null || ind.leftChars != null) {
      const val = ind.leftChars != null ? ind.leftChars + ' 字符' : ind.leftCm + ' 厘米';
      html += ftRow('左缩进', val);
    }
    if (ind.rightCm != null || ind.rightChars != null) {
      const val = ind.rightChars != null ? ind.rightChars + ' 字符' : ind.rightCm + ' 厘米';
      html += ftRow('右缩进', val);
    }
    if (ind.firstLineChars != null || ind.firstLineCm != null) {
      const val = ind.firstLineChars != null ? ind.firstLineChars + ' 字符' : ind.firstLineCm + ' 厘米';
      html += ftRow('首行缩进', val);
    }
    if (ind.hangingCm != null) {
      html += ftRow('悬挂缩进', ind.hangingCm + ' 厘米');
    }
  }
  if (ppr.spacing) {
    const sp = ppr.spacing;
    if (sp.beforePt != null) html += ftRow('段前', sp.beforeLines != null ? sp.beforeLines + ' 行' : sp.beforePt + ' 磅');
    if (sp.afterPt != null) html += ftRow('段后', sp.afterLines != null ? sp.afterLines + ' 行' : sp.afterPt + ' 磅');
    if (sp.lineRuleLabel) {
      let lineVal = '';
      if (sp.lineRule === 'auto') lineVal = sp.lineMultiple + ' 倍';
      else lineVal = sp.linePt + ' 磅';
      html += ftRow('行距', sp.lineRuleLabel + ' ' + lineVal);
    }
  }
  if (ppr.shading) {
    const parts = [];
    if (ppr.shading.val) parts.push(ppr.shading.val);
    if (ppr.shading.fill && ppr.shading.fill !== 'auto') parts.push('填充: #' + ppr.shading.fill);
    if (ppr.shading.themeFill) parts.push('主题: ' + ppr.shading.themeFill);
    html += ftRow('底纹', parts.join('，') || '(有)');
  }
  if (ppr.borders) {
    const sides = Object.keys(ppr.borders).join('、');
    html += ftRow('边框', sides);
  }
  if (ppr.tabs && ppr.tabs.length) {
    html += ftRow('制表位', ppr.tabs.map(t => t.posCm + 'cm ' + t.val).join('；'));
  }
  if (ppr.keepNext) html += ftRow('与下段同页', '是');
  if (ppr.keepLines) html += ftRow('段中不分页', '是');
  if (ppr.widowControl === false) html += ftRow('孤行控制', '关');
  if (ppr.outlineLevel != null) html += ftRow('大纲级别', '级别 ' + (ppr.outlineLevel + 1));
  html += '</div>';
  return html;
}

function renderSectPrSection(sectPr, isInline) {
  let html = '<div class="ft-sub">';
  if (isInline) {
    html += ftRow('来源', '段落内嵌分节符');
  }
  if (sectPr.sectionStart) {
    const startMap = { nextPage: '新建页', continuous: '连续', evenPage: '偶数页', oddPage: '奇数页' };
    html += ftRow('节的起始位置', startMap[sectPr.sectionStart] || sectPr.sectionStart);
  }
  if (sectPr.pageSize) {
    html += ftRow('纸张大小', sectPr.pageSize.widthCm + ' × ' + sectPr.pageSize.heightCm + ' 厘米');
    if (sectPr.pageSize.orient) html += ftRow('纸张方向', sectPr.pageSize.orient === 'landscape' ? '横向' : '纵向');
  }
  if (sectPr.margins) {
    const m = sectPr.margins;
    html += ftRow('页边距 上', m.topCm + ' 厘米');
    html += ftRow('页边距 下', m.bottomCm + ' 厘米');
    html += ftRow('页边距 左', m.leftCm + ' 厘米');
    html += ftRow('页边距 右', m.rightCm + ' 厘米');
    if (m.headerCm != null) html += ftRow('页眉', m.headerCm + ' 厘米');
    if (m.footerCm != null) html += ftRow('页脚', m.footerCm + ' 厘米');
    if (m.gutterCm) html += ftRow('装订线', m.gutterCm + ' 厘米');
  }
  if (sectPr.columns && sectPr.columns.num > 1) {
    html += ftRow('分栏', sectPr.columns.num + ' 栏，间距 ' + (sectPr.columns.spaceCm || 0) + ' 厘米');
  }
  if (sectPr.headers) {
    html += ftRow('页眉', sectPr.headers.map(h => h.type).join('、'));
  }
  if (sectPr.footers) {
    html += ftRow('页脚', sectPr.footers.map(f => f.type).join('、'));
  }
  if (sectPr.pageNumbering) {
    const pn = sectPr.pageNumbering;
    const parts = [];
    if (pn.fmt) parts.push('格式: ' + pn.fmt);
    if (pn.start) parts.push('起始: ' + pn.start);
    html += ftRow('页码', parts.join('，'));
  }
  html += '</div>';
  return html;
}

function renderRoleSummary() {
  if (!el.roleSummary) return;
  const counts = {};
  for (const role of Object.values(state.blockRoles)) {
    counts[role] = (counts[role] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([role, count]) => `${role}: ${count}`);
  el.roleSummary.textContent = parts.length ? `已标记：${parts.join('，')}` : '尚未标记任何语义角色（右键点击段落来标记）';

  if (el.roleChips) {
    el.roleChips.innerHTML = '';
    for (const [role, count] of Object.entries(counts)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${role}: ${count} 个`;
      el.roleChips.appendChild(chip);
    }
  }
}

function renderTempStylesPanel() {
  if (!el.inspectorTempStyleList) return;
  el.inspectorTempStyleList.innerHTML = '';
  if (!state.tempStyles.length) {
    el.inspectorTempStyleList.innerHTML = '<div class="muted">尚未聚类，点击「自动聚类」生成临时样式。</div>';
    return;
  }
  for (const ts of state.tempStyles) {
    const item = document.createElement('div');
    item.className = 'style-item';
    item.innerHTML = `
      <div class="style-name">${ts.id}</div>
      <div class="style-meta">${ts.suggestedRole} / ${ts.blockCount} 个块 / ${ts.format.fontFamily || '?'} ${ts.format.fontSizePt || '?'}pt</div>
    `;
    el.inspectorTempStyleList.appendChild(item);
  }
}

function renderProfileList() {
  if (!el.profileList) return;
  el.profileList.innerHTML = '';
  if (el.noProfilesNote) el.noProfilesNote.classList.toggle('hidden', state.profiles.length > 0);
  for (const profile of state.profiles) {
    const item = document.createElement('div');
    item.className = `preset-item${state.activeProfileName === profile.profileName ? ' active' : ''}`;
    const mappedCount = profile.styles ? Object.values(profile.styles).filter(Boolean).length : 0;
    item.innerHTML = `
      <div class="preset-name">${profile.profileName}</div>
      <div class="preset-meta">来源：${profile.sourceTemplate || '未知'} / 已映射 ${mappedCount} 个样式</div>
    `;
    item.addEventListener('click', () => {
      state.activeProfileName = profile.profileName;
      render();
    });
    el.profileList.appendChild(item);
  }
}

function renderProfileEditor() {
  if (!el.profileEditor) return;
  const profile = state.profiles.find(p => p.profileName === state.activeProfileName);
  const hasProfile = !!profile;
  el.profileEditor.classList.toggle('hidden', !hasProfile);
  if (!hasProfile) return;

  el.editProfileName.value = profile.profileName;
  el.editSourceTemplate.value = profile.sourceTemplate || '';

  const styleList = state.extractStyleList.length ? state.extractStyleList : [];
  el.styleMappingList.innerHTML = '';
  const roleLabels = {
    body: '正文', heading1: '一级标题', heading2: '二级标题', heading3: '三级标题',
    caption: '图题/表题', code: '代码块', note: '提示说明',
    table: '表格', listLevel1: '列表一级', listLevel2: '列表二级',
  };

  const tempStylesByRole = {};
  for (const ts of state.tempStyles) {
    if (!tempStylesByRole[ts.suggestedRole]) tempStylesByRole[ts.suggestedRole] = [];
    tempStylesByRole[ts.suggestedRole].push(ts);
  }

  for (const [role, label] of Object.entries(roleLabels)) {
    const currentVal = (profile.styles && profile.styles[role]) || '';
    const row = document.createElement('div');
    row.className = 'form-grid';
    row.style.marginBottom = '8px';
    const labelEl = document.createElement('label');
    labelEl.textContent = `${role} (${label})`;
    row.appendChild(labelEl);

    const select = document.createElement('select');
    select.dataset.role = role;
    select.innerHTML = '<option value="">-- 未映射 --</option>';

    if (tempStylesByRole[role] && tempStylesByRole[role].length) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = '聚类样式';
      for (const ts of tempStylesByRole[role]) {
        const option = document.createElement('option');
        option.value = ts.id;
        option.textContent = `${ts.id} (${ts.blockCount} blocks)`;
        if (ts.id === currentVal) option.selected = true;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }

    if (styleList.length) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Word 样式';
      for (const style of styleList) {
        const option = document.createElement('option');
        option.value = style.styleId;
        option.textContent = style.styleId + (style.styleName ? ' / ' + style.styleName : '');
        if (style.styleId === currentVal) option.selected = true;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }

    if (currentVal && !styleList.find(s => s.styleId === currentVal) &&
        !(tempStylesByRole[role] || []).find(ts => ts.id === currentVal)) {
      const option = document.createElement('option');
      option.value = currentVal;
      option.textContent = `${currentVal} (当前值)`;
      option.selected = true;
      select.appendChild(option);
    }
    row.appendChild(select);
    row.appendChild(document.createElement('span'));
    el.styleMappingList.appendChild(row);
  }
}

async function saveProfileEdits() {
  const profile = state.profiles.find(p => p.profileName === state.activeProfileName);
  if (!profile) return;
  const oldName = profile.profileName;
  profile.profileName = el.editProfileName.value.trim();
  profile.sourceTemplate = el.editSourceTemplate.value.trim();
  profile.styles = profile.styles || {};
  for (const select of (el.styleMappingList || {}).querySelectorAll ? el.styleMappingList.querySelectorAll('select') : []) {
    const role = select.dataset.role;
    profile.styles[role] = select.value || null;
  }
  if (profile.profileName !== oldName) {
    await window.writemaster.deleteProfile(oldName);
  }
  const result = await window.writemaster.saveProfile(profile);
  if (result.ok) {
    state.outputMessage = `Profile "${profile.profileName}" 已更新`;
    state.runState = 'success';
  }
  await refreshProfiles();
  render();
}

function renderProfileSelect() {
  if (!el.profileSelect) return;
  el.profileSelect.innerHTML = '<option value="">使用内置规则（默认）</option>';
  for (const profile of state.profiles) {
    const option = document.createElement('option');
    option.value = profile.profileName;
    option.textContent = profile.profileName;
    if (profile.profileName === state.selectedProfileName) option.selected = true;
    el.profileSelect.appendChild(option);
  }
}

function trackRecentInput(filePath) {
  if (!filePath) return;
  state.recentInputs = [filePath, ...state.recentInputs.filter(p => p !== filePath)].slice(0, 10);
}

function trackRecentMaster(filePath) {
  if (!filePath) return;
  state.recentMasters = [filePath, ...state.recentMasters.filter(p => p !== filePath)].slice(0, 10);
}

function renderRecentFiles() {
  if (!el.recentFiles) return;
  el.recentFiles.innerHTML = '';
  const masters = state.recentMasters.slice(0, 8);
  const inputs = state.recentInputs.slice(0, 8);
  if (!masters.length && !inputs.length) {
    el.recentFiles.innerHTML = '<div class="muted" style="padding: 10px 0;">暂无最近使用的文件</div>';
    return;
  }
  for (const fp of masters) {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    const basename = fp.replace(/\\/g, '/').split('/').pop();
    card.innerHTML = `<div class="card-title">母版：${basename}</div><div class="card-sub">${fp}</div>`;
    card.addEventListener('click', async () => {
      if (state.activeView === 'template-view') {
        await loadMasterForExtract(fp);
      } else {
        setActiveView('template-view');
        await loadMasterForExtract(fp);
      }
    });
    el.recentFiles.appendChild(card);
  }
  for (const fp of inputs) {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    const basename = fp.replace(/\\/g, '/').split('/').pop();
    card.innerHTML = `<div class="card-title">输入：${basename}</div><div class="card-sub">${fp}</div>`;
    card.addEventListener('click', () => {
      state.inputPath = fp;
      if (state.activeView !== 'landing-view') setActiveView('landing-view');
      render();
    });
    el.recentFiles.appendChild(card);
  }
}

function render() {
  renderViewMeta();
  renderVisibility();
  renderMasterSelect();
  renderMasterCards();
  renderFormValues();
  renderOutput();
  renderMasterSummary();
  renderStatus();
  renderStateJson();
  renderExtractUpload();
  renderBlockPreview();
  renderContextMenu();
  renderBlockInspector();
  renderFormatPanel();
  renderRoleSummary();
  renderTempStylesPanel();
  renderSavedTempStyles();
  renderProfileList();
  renderProfileEditor();
  renderProfileSelect();
  renderRecentFiles();
  // Disable run buttons during processing
  const busy = state.runState === 'running';
  if (el.run) el.run.disabled = busy;
  if (el.primaryAction) el.primaryAction.disabled = busy;
}

async function refreshMasters() {
  const masters = await window.writemaster.listMasters();
  state.masters = masters;
  if (!state.masters.find((master) => master.id === state.selectedMasterId) && state.selectedMasterId !== CUSTOM_MASTER_ID) {
    state.selectedMasterId = state.masters.find((master) => master.isDefault)?.id || 'review-master';
  }
  render();
}

async function runTask() {
  setRunState('running', 'Processing...');
  const payload = {
    mode: state.mode,
    inputPath: state.inputPath.trim(),
    name: state.suffix.trim() || undefined,
    masterId: isCustomMasterSelected() ? undefined : state.selectedMasterId,
    customMasterPath: isCustomMasterSelected() ? state.customMasterPath.trim() || undefined : undefined,
    pandocPath: state.pandocPath.trim() || undefined,
    backupMdPath: state.backupMdPath.trim() || undefined,
    profileName: state.selectedProfileName || undefined,
  };

  let result;
  if (state.selectedProfileName) {
    result = await window.writemaster.runWithProfile(payload);
  } else {
    result = await window.writemaster.run(payload);
  }

  if (result.ok) {
    state.lastOutputPath = result.outputPath;
    trackRecentInput(state.inputPath);
    setRunState('success', `Done: ${result.outputPath}`);
  } else {
    setRunState('error', `Failed:\n${result.error}`);
  }
}

function resetTask() {
  state.mode = 'md';
  state.inputPath = '';
  state.suffix = '';
  state.selectedMasterId = state.masters.find((master) => master.isDefault)?.id || 'review-master';
  state.customMasterPath = '';
  state.pandocPath = '';
  state.backupMdPath = '';
  state.runState = 'idle';
  state.outputMessage = '等待任务执行。';
  render();
}

function bindEvents() {
  el.navButtons.forEach((btn) => btn.addEventListener('click', () => setActiveView(btn.dataset.viewTarget)));

  el.mode.addEventListener('change', () => {
    state.mode = el.mode.value;
    render();
  });
  el.inputPath.addEventListener('input', () => { state.inputPath = el.inputPath.value; renderStateJson(); });
  el.suffix.addEventListener('input', () => { state.suffix = el.suffix.value; renderStateJson(); });
  el.customMasterPath.addEventListener('input', () => { state.customMasterPath = el.customMasterPath.value; render(); });
  el.pandocPath.addEventListener('input', () => { state.pandocPath = el.pandocPath.value; renderStateJson(); });
  el.backupMdPath.addEventListener('input', () => { state.backupMdPath = el.backupMdPath.value; renderStateJson(); });

  el.masterSelect.addEventListener('change', () => {
    state.selectedMasterId = el.masterSelect.value;
    render();
  });

  el.profileSelect.addEventListener('change', () => {
    state.selectedProfileName = el.profileSelect.value;
    render();
  });

  el.chooseFile.addEventListener('click', async () => {
    const picked = await window.writemaster.pickFile(state.mode);
    if (picked) {
      state.inputPath = picked;
      render();
    }
  });

  const pickMaster = async () => {
    const picked = await window.writemaster.pickMasterFile();
    if (picked) {
      state.selectedMasterId = CUSTOM_MASTER_ID;
      state.customMasterPath = picked;
      render();
    }
  };
  el.pickCustomMaster.addEventListener('click', pickMaster);
  el.chooseMasterFile.addEventListener('click', pickMaster);

  el.run.addEventListener('click', runTask);
  el.primaryAction.addEventListener('click', runTask);
  el.resetTask.addEventListener('click', resetTask);
  el.refreshMasters.addEventListener('click', refreshMasters);

  el.aboutBtn.addEventListener('click', () => {
    window.alert('WriteMaster v0.5.0\n\n统一 DOCX 格式整理工作流工具\n\n功能：\n• Markdown / DOCX → 标准化 DOCX 输出\n• 母版结构提取与段落语义标注\n• 自动样式聚类与 Profile 配置\n• 编号解析、docDefaults 字体回退\n\n入口：CLI / Node bundle / Electron 桌面版\n\nGitHub: https://github.com/Ysoseri1224/Fully-Auto-Docx-Format-Process');
  });

  // --- Extraction event handlers ---

  el.importOtherTemplate.addEventListener('click', async () => {
    const picked = await window.writemaster.pickMasterFile();
    if (picked) await loadMasterForExtract(picked);
  });

  el.pickMasterForExtract.addEventListener('click', async () => {
    const picked = await window.writemaster.pickMasterFile();
    if (picked) await loadMasterForExtract(picked);
  });

  // Close context menu on click anywhere outside
  document.addEventListener('click', () => {
    if (state.rightClickMenuVisible) {
      state.rightClickMenuVisible = false;
      render();
    }
  });

  // Context menu role assignment
  if (el.contextMenu) {
    el.contextMenu.querySelectorAll('.context-item[data-role]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const role = item.dataset.role;
        if (state.rightClickTargetId) {
          state.blockRoles[state.rightClickTargetId] = role;
          if (role === 'ignore') {
            state.selectedBlockId = null;
          }
        }
        state.rightClickMenuVisible = false;
        render();
      });
    });
  }

  // --- P5: Profile config ---

  el.importProfileBtn.addEventListener('click', async () => {
    const filePath = await window.writemaster.pickProfileFile('import');
    if (filePath) {
      const result = await window.writemaster.importProfile(filePath);
      if (result.ok) {
        state.outputMessage = `已导入 Profile: ${result.profile.profileName}`;
        state.runState = 'success';
        await refreshProfiles();
      } else {
        setRunState('error', `导入失败：${result.error}`);
      }
    }
  });

  el.exportProfileBtn.addEventListener('click', async () => {
    if (!state.activeProfileName) return;
    const filePath = await window.writemaster.pickProfileFile('export');
    if (filePath) {
      const result = await window.writemaster.exportProfile(state.activeProfileName, filePath);
      if (result.ok) {
        state.outputMessage = `已导出到: ${filePath}`;
        state.runState = 'success';
      }
    }
    render();
  });

  el.deleteProfileBtn.addEventListener('click', async () => {
    if (!state.activeProfileName) return;
    await window.writemaster.deleteProfile(state.activeProfileName);
    state.activeProfileName = null;
    await refreshProfiles();
    render();
  });

  el.saveEditProfile.addEventListener('click', saveProfileEdits);
  el.cancelEditProfile.addEventListener('click', () => {
    state.activeProfileName = null;
    render();
  });

  // --- P4: Clustering and Profile generation ---

  el.clusterBtn.addEventListener('click', async () => {
    if (!state.extractBlocks.length) return;
    const result = await window.writemaster.clusterBlocks(state.extractBlocks);
    if (result.ok) {
      state.tempStyles = result.tempStyles;
      // Auto-assign blockRoles from clustered suggestedRole
      for (const ts of result.tempStyles) {
        if (ts.suggestedRole && ts.suggestedRole !== 'unknown') {
          for (const blockId of ts.sourceBlockIds || []) {
            if (!state.blockRoles[blockId]) {
              state.blockRoles[blockId] = ts.suggestedRole;
            }
          }
        }
      }
      showToast(`已生成 ${result.tempStyles.length} 个临时样式并自动标记角色`);
      setRunState('success', `已生成 ${result.tempStyles.length} 个临时样式`);
    } else {
      setRunState('error', `聚类失败：${result.error}`);
    }
    render();
  });

  el.generateProfileBtn.addEventListener('click', async () => {
    const profileName = el.profileName.value.trim();
    if (!profileName) {
      setRunState('error', '请先输入 Profile 名称');
      render();
      return;
    }
    const result = await window.writemaster.generateProfile(
      state.extractBlocks,
      state.blockRoles,
      state.extractStyleList,
      profileName,
      state.masterFilePath
    );
    if (!result.ok) {
      setRunState('error', `生成 Profile 失败：${result.error}`);
      render();
      return;
    }
    // Fill null style slots with best temp style per role
    if (state.tempStyles.length && result.profile.styles) {
      const bestByRole = {};
      for (const ts of state.tempStyles) {
        if (!ts.suggestedRole || ts.suggestedRole === 'unknown') continue;
        if (!bestByRole[ts.suggestedRole] || ts.blockCount > bestByRole[ts.suggestedRole].blockCount) {
          bestByRole[ts.suggestedRole] = ts;
        }
      }
      for (const [role, val] of Object.entries(result.profile.styles)) {
        if (!val && bestByRole[role]) {
          result.profile.styles[role] = bestByRole[role].id;
        }
      }
    }
    const saveResult = await window.writemaster.saveProfile(result.profile);
    if (saveResult.ok) {
      state.outputMessage = `Profile "${profileName}" 已保存`;
      state.runState = 'success';
      await refreshProfiles();
    } else {
      setRunState('error', `保存失败：${saveResult.error}`);
    }
    render();
  });

  el.rightTopTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.rightTopTabs.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      el.inspectorPanels.forEach((panel) => panel.classList.toggle('active', panel.id === btn.dataset.tabTarget));
    });
  });

  el.stateSubTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.stateSubTabs.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.stateSub;
      el.stateJsonContent.style.display = target === 'state-json' ? '' : 'none';
      el.stateFormatContent.style.display = target === 'state-format' ? '' : 'none';
    });
  });

  el.saveAsTempStyle.addEventListener('click', async () => {
    const name = el.tempStyleName.value.trim();
    if (!name) { showToast('请输入样式名称'); return; }
    if (!state.selectedBlockId || !state.extractBlocks.length) { showToast('请先选中一个段落块'); return; }
    const block = state.extractBlocks.find(b => b.id === state.selectedBlockId);
    if (!block || !block.format || !block.format.effective) { showToast('该块无格式信息'); return; }
    const entry = { name, format: block.format.effective, sourceBlockId: block.id };
    state.savedTempStyles = state.savedTempStyles.filter(s => s.name !== name);
    state.savedTempStyles.push(entry);
    el.tempStyleName.value = '';
    await window.writemaster.saveTempStyles(state.savedTempStyles);
    showToast(`已保存临时样式「${name}」`);
    render();
  });
}

async function loadMasterForExtract(sourcePathOrId) {
  setRunState('running', '正在解析母版结构...');
  try {
    const result = await window.writemaster.extractMaster(sourcePathOrId);
    if (result.ok) {
      state.masterFilePath = sourcePathOrId;
      state.extractBlocks = result.blocks;
      state.extractStyleList = result.styleList;
      state.documentSectPr = result.documentSectPr || null;
      state.headersFooters = result.headersFooters || null;
      state.selectedBlockId = null;
      state.blockRoles = {};
      state.tempStyles = [];
      trackRecentMaster(sourcePathOrId);
      setRunState('success', `已解析 ${result.blocks.length} 个段落块`);
    } else {
      setRunState('error', `解析失败：${result.error}`);
    }
  } catch (err) {
    setRunState('error', `解析异常：${err.message}`);
  }
  render();
}

async function refreshProfiles() {
  const result = await window.writemaster.loadProfiles();
  if (result.ok) {
    state.profiles = result.profiles;
  }
}

async function init() {
  bindEvents();
  await refreshMasters();
  await refreshProfiles();
  const loaded = await window.writemaster.loadTempStyles();
  if (loaded && loaded.ok && loaded.styles) {
    state.savedTempStyles = loaded.styles;
  }
  render();
}

init().catch((error) => {
  state.runState = 'error';
  state.outputMessage = `Failed to initialize:\n${error.stack || error.message}`;
  render();
});
