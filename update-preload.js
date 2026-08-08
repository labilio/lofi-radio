const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  download: () => {
    ipcRenderer.send('update-download');
  },
  install: () => {
    ipcRenderer.send('update-install');
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
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
