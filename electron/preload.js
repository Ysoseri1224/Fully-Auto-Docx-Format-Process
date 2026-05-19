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
});
