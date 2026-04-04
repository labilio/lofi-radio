const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  download: (url) => {
    ipcRenderer.send('update-download', url);
  },
  viewChanges: () => {
    ipcRenderer.send('update-view-changes');
  },
  skip: () => {
    ipcRenderer.send('update-skip');
  },
  close: () => {
    ipcRenderer.send('update-close');
  }
});
