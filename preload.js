// preload.js - 预加载脚本，安全地暴露一些API给渲染进程

const { contextBridge, ipcRenderer } = require('electron');

// #region agent log - IPC API exposure
fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'debug-session',
    runId: 'initial',
    hypothesisId: 'IPC_API_EXPOSURE',
    location: 'preload.js:6',
    message: 'Preload script starting, about to expose APIs',
    data: { contextBridgeAvailable: !!contextBridge, ipcRendererAvailable: !!ipcRenderer },
    timestamp: Date.now()
  })
}).catch(() => {});
// #endregion

// 通过 contextBridge 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('lofiWidget', {
  // 播放/暂停控制
  togglePlayPause: () => {
    // #region agent log - Toggle play/pause IPC call
    fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'IPC_TOGGLE_CALL',
        location: 'preload.js:20',
        message: 'Sending toggle-play-pause IPC message',
        data: {},
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    ipcRenderer.send('toggle-play-pause');
  },

  // 设置音量
  setVolume: (volume) => {
    // #region agent log - Set volume IPC call
    fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'IPC_VOLUME_CALL',
        location: 'preload.js:35',
        message: 'Sending set-volume IPC message',
        data: { volume },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    ipcRenderer.send('set-volume', volume);
  },

  // 关闭应用
  closeApp: () => {
    // #region agent log - Close app IPC call
    fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'IPC_CLOSE_CALL',
        location: 'preload.js:50',
        message: 'Sending close-app IPC message',
        data: {},
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    ipcRenderer.send('close-app');
  },

  // 监听播放状态变化（从主进程）
  onPlayStateChange: (callback) => {
    ipcRenderer.on('play-state-changed', (event, isPlaying) => {
      callback(isPlaying);
    });
  },

  // 监听音量变化（从主进程）
  onVolumeChange: (callback) => {
    ipcRenderer.on('volume-changed', (event, volume) => {
      callback(volume);
    });
  }
});

// #region agent log - API exposure complete
fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'debug-session',
    runId: 'initial',
    hypothesisId: 'IPC_API_EXPOSURE',
    location: 'preload.js:75',
    message: 'API exposure complete, window.lofiWidget should be available',
    data: {},
    timestamp: Date.now()
  })
}).catch(() => {});
// #endregion