const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  download: (url) => {
    ipcRenderer.send('update-download', url);
  },
  viewChanges: () => {
    ipcRenderer.send('update-view-changes');
  },
  viewRepository: () => {
    ipcRenderer.send('update-view-repository');
  },
  skip: (version) => {
    ipcRenderer.send('update-skip', version);
  },
  close: () => {
    ipcRenderer.send('update-close');
  },
  retry: () => {
    ipcRenderer.send('update-retry');
  }
});
