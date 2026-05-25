const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('writemaster', {
  pickFile(mode) {
    return ipcRenderer.invoke('writemaster:pick-file', { mode });
  },
  pickMasterFile() {
    return ipcRenderer.invoke('writemaster:pick-master-file');
  },
  listMasters() {
    return ipcRenderer.invoke('writemaster:list-masters');
  },
  run(payload) {
    return ipcRenderer.invoke('writemaster:run', payload);
  },
  extractMaster(filePath) {
    return ipcRenderer.invoke('writemaster:extract-master', { filePath });
  },
  saveProfile(profile) {
    return ipcRenderer.invoke('writemaster:save-profile', { profile });
  },
  loadProfiles() {
    return ipcRenderer.invoke('writemaster:load-profiles');
  },
  deleteProfile(profileName) {
    return ipcRenderer.invoke('writemaster:delete-profile', { profileName });
  },
  pickProfileFile(mode) {
    return ipcRenderer.invoke('writemaster:pick-profile-file', { mode });
  },
  importProfile(filePath) {
    return ipcRenderer.invoke('writemaster:import-profile', { filePath });
  },
  exportProfile(profileName, filePath) {
    return ipcRenderer.invoke('writemaster:export-profile', { profileName, filePath });
  },
  clusterBlocks(blocks) {
    return ipcRenderer.invoke('writemaster:cluster-blocks', { blocks });
  },
  generateProfile(blocks, blockRoles, styleList, profileName, sourceTemplate) {
    return ipcRenderer.invoke('writemaster:generate-profile', { blocks, blockRoles, styleList, profileName, sourceTemplate });
  },
  runWithProfile(payload) {
    return ipcRenderer.invoke('writemaster:run-with-profile', payload);
  },
  saveTempStyles(styles) {
    return ipcRenderer.invoke('writemaster:save-temp-styles', { styles });
  },
  loadTempStyles() {
    return ipcRenderer.invoke('writemaster:load-temp-styles');
  },
  checkPandoc(explicitPath) {
    return ipcRenderer.invoke('writemaster:check-pandoc', { explicitPath });
  },
  installPandoc() {
    return ipcRenderer.invoke('writemaster:install-pandoc');
  },
  // Review feature
  reviewPickFile() {
    return ipcRenderer.invoke('writemaster:review-pick-file');
  },
  reviewReadFile(filePath, fileType) {
    return ipcRenderer.invoke('writemaster:review-read-file', { filePath, fileType });
  },
  reviewReadCCSwitch() {
    return ipcRenderer.invoke('writemaster:review-read-ccswitch');
  },
  reviewLoadSkills() {
    return ipcRenderer.invoke('writemaster:review-load-skills');
  },
  reviewLoadSkillContent(skillId) {
    return ipcRenderer.invoke('writemaster:review-load-skill-content', { skillId });
  },
  reviewStart(payload) {
    return ipcRenderer.invoke('writemaster:review-start', payload);
  },
  reviewStop() {
    return ipcRenderer.invoke('writemaster:review-stop');
  },
  reviewSaveReport(content) {
    return ipcRenderer.invoke('writemaster:review-save-report', content);
  },
  onReviewChunk(callback) {
    ipcRenderer.on('writemaster:review-stream-chunk', (_, text) => callback(text));
  },
  onReviewDone(callback) {
    ipcRenderer.on('writemaster:review-stream-done', () => callback());
  },
  onReviewError(callback) {
    ipcRenderer.on('writemaster:review-stream-error', (_, err) => callback(err));
  },
  // Version & update
  getVersion() {
    return ipcRenderer.invoke('writemaster:get-version');
  },
  checkUpdate() {
    return ipcRenderer.invoke('writemaster:check-update');
  },
  installUpdate() {
    return ipcRenderer.invoke('writemaster:install-update');
  },
  onUpdateStatus(callback) {
    ipcRenderer.on('writemaster:update-status', (_, data) => callback(data));
  },
});
