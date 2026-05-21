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
};

const CUSTOM_MASTER_ID = '__custom__';

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
  stateJson: document.getElementById('stateJson'),
  inspectorMasterList: document.getElementById('inspectorMasterList'),
  lastOutput: document.getElementById('lastOutput'),
  currentMasterMeta: document.getElementById('currentMasterMeta'),
  currentModeMeta: document.getElementById('currentModeMeta'),
  rightTopTabs: document.querySelectorAll('#rightTopTabs [data-panel-target]'),
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
  summaryTabs: document.querySelectorAll('#summaryTabs [data-summary-target]'),
  summaryPanels: document.querySelectorAll('.summary-bottom'),
  inspectorMasterSummary: document.getElementById('inspectorMasterSummary'),
  summaryResultBox: document.getElementById('summaryResultBox'),
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
  render();
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

function renderInspectorMasterList() {
  el.inspectorMasterList.innerHTML = '';
  for (const master of state.masters) {
    const item = document.createElement('div');
    item.className = `style-item${state.selectedMasterId === master.id ? ' active' : ''}`;
    item.innerHTML = `
      <div class="style-name">${master.id}</div>
      <div class="style-meta">${master.label} / ${master.kind} / ${master.sourceType}</div>
    `;
    el.inspectorMasterList.appendChild(item);
  }
}

function renderViewMeta() {
  const meta = viewMeta[state.activeView];
  el.toolbarTitle.textContent = meta.title;
  el.modeTag.textContent = meta.mode;
  if (state.activeView === 'template-view' && state.masterFilePath) {
    const basename = state.masterFilePath.replace(/\\/g, '/').split('/').pop();
    el.typeTag.textContent = basename;
    el.toolbarTitle.textContent = '模板提取：' + basename;
  } else {
    el.typeTag.textContent = meta.type;
  }
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
  if (el.extractResult) el.extractResult.classList.toggle('hidden', !hasMaster);
}

function renderBlockPreview() {
  if (!el.blockPreview) return;
  el.blockPreview.innerHTML = '';
  if (!state.extractBlocks.length) {
    el.blockPreview.innerHTML = '<div class="muted" style="padding:40px;text-align:center;">没有检测到段落块。</div>';
    return;
  }
  for (const block of state.extractBlocks) {
    const div = document.createElement('div');
    div.className = 'block';
    div.dataset.blockId = block.id;
    div.textContent = block.text || '(空段落)';

    const role = state.blockRoles[block.id] || 'unknown';
    if (role !== 'unknown') {
      div.classList.add(role);
    } else if (block.styleSource && block.styleSource.styleName) {
      const sn = block.styleSource.styleName.toLowerCase();
      if (sn.includes('heading 1')) div.classList.add('heading1');
      else if (sn.includes('heading 2')) div.classList.add('heading2');
      else if (sn.includes('heading 3')) div.classList.add('heading3');
    }

    if (block.type === 'table') div.classList.add('table');
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
    for (const style of styleList) {
      const option = document.createElement('option');
      option.value = style.styleId;
      option.textContent = style.styleId + (style.styleName ? ' / ' + style.styleName : '');
      if (style.styleId === currentVal) option.selected = true;
      select.appendChild(option);
    }
    if (currentVal && !styleList.find(s => s.styleId === currentVal)) {
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
  state.recentInputs = [filePath, ...state.recentInputs.filter(p => p !== filePath)].slice(0, 5);
}

function trackRecentMaster(filePath) {
  if (!filePath) return;
  state.recentMasters = [filePath, ...state.recentMasters.filter(p => p !== filePath)].slice(0, 5);
}

function renderRecentFiles() {
  if (!el.recentFiles) return;
  el.recentFiles.innerHTML = '';
  const masters = state.recentMasters.slice(0, 3);
  const inputs = state.recentInputs.slice(0, 3);
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
  renderInspectorMasterList();
  renderFormValues();
  renderOutput();
  renderMasterSummary();
  renderStatus();
  renderStateJson();
  renderExtractUpload();
  renderBlockPreview();
  renderContextMenu();
  renderBlockInspector();
  renderRoleSummary();
  renderTempStylesPanel();
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
    window.alert('WriteMaster v0.1.0\n统一 DOCX 格式整理工作流\n\n入口：CLI / Node bundle / Electron / Rust\n\n内置母版：review-master (默认), chapter10-monograph\n支持：模板提取 → Profile 配置 → 应用任务');
  });

  // --- Extraction event handlers ---

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
      el.inspectorPanels.forEach((panel) => panel.classList.toggle('active', panel.id === btn.dataset.panelTarget));
    });
  });

  el.summaryTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.summaryTabs.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      el.summaryPanels.forEach((panel) => panel.classList.toggle('active', panel.id === btn.dataset.summaryTarget));
    });
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
  render();
}

init().catch((error) => {
  state.runState = 'error';
  state.outputMessage = `Failed to initialize:\n${error.stack || error.message}`;
  render();
});
