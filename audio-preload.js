const { contextBridge, ipcRenderer } = require('electron');
const { BilibiliMediaAdapter } = require('./bilibili-media-adapter');

let bilibiliAdapter = null;
let bilibiliSessionId = null;
let currentVolume = 0.3;

function destroyBilibiliAdapter(sessionId = null) {
  if (!bilibiliAdapter) return;
  if (sessionId !== null && sessionId !== bilibiliSessionId) return;

  bilibiliAdapter.destroy();
  bilibiliAdapter = null;
  bilibiliSessionId = null;
}

ipcRenderer.on('audio-command-bilibili', (_event, request) => {
  destroyBilibiliAdapter();
  bilibiliSessionId = request.sessionId;
  bilibiliAdapter = new BilibiliMediaAdapter({ document });
  bilibiliAdapter.setVolume(currentVolume);
  bilibiliAdapter.onStateChange((state) => {
    ipcRenderer.send('audio-state-update', {
      sessionId: request.sessionId,
      ...state
    });
  });
  bilibiliAdapter.load(request);
});

ipcRenderer.on('audio-command-volume', (_event, volume) => {
  currentVolume = volume;
  bilibiliAdapter?.setVolume(volume);
});

ipcRenderer.on('audio-command-destroy', (_event, request) => {
  destroyBilibiliAdapter(request.sessionId);
});

contextBridge.exposeInMainWorld('audioPlayer', {
  onLoad: (callback) => {
    ipcRenderer.on('audio-command-load', (_event, request) => callback(request));
  },
  onSetVolume: (callback) => {
    ipcRenderer.on('audio-command-volume', (_event, volume) => callback(volume));
  },
  onDestroy: (callback) => {
    ipcRenderer.on('audio-command-destroy', (_event, request) => callback(request));
  },
  sendState: (state) => {
    ipcRenderer.send('audio-state-update', state);
  }
});

globalThis.addEventListener('unload', () => {
  destroyBilibiliAdapter();
});
