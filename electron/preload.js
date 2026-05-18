const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('writemaster', {
  pickFile(mode) {
    return ipcRenderer.invoke('writemaster:pick-file', { mode });
  },
  run(payload) {
    return ipcRenderer.invoke('writemaster:run', payload);
  },
});
