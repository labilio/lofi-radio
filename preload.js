// preload.js - 预加载脚本，安全地暴露一些API给渲染进程

const { contextBridge, ipcRenderer } = require('electron');

// 通过 contextBridge 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('lofiWidget', {
  // 播放/暂停控制
  togglePlayPause: () => {
    ipcRenderer.send('toggle-play-pause');
  },

  // 设置音量
  setVolume: (volume) => {
    ipcRenderer.send('set-volume', volume);
  },

  // 关闭应用
  closeApp: () => {
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
  },

  // 电台控制 API
  getStations: () => ipcRenderer.send('get-stations'),
  changeStation: (index) => ipcRenderer.send('change-station', index),
  prevStation: () => ipcRenderer.send('prev-station'),
  nextStation: () => ipcRenderer.send('next-station'),
  randomStation: () => ipcRenderer.send('random-station'),
  
  onStationsList: (callback) => {
    ipcRenderer.on('stations-list', (event, stations) => callback(stations));
  },
  
  onStationChanged: (callback) => {
    ipcRenderer.on('station-changed', (event, station, index) => callback(station, index));
  }
});

// 通用的 Electron API（用于测试窗口等）
contextBridge.exposeInMainWorld('electronAPI', {
  // 关闭窗口
  closeWindow: () => {
    ipcRenderer.send('close-app');
  },

  // Mini模式切换
  toggleMiniMode: () => {
    ipcRenderer.send('toggle-mini-mode');
  }
});

// 音频窗口专用API
contextBridge.exposeInMainWorld('audioPlayer', {
  onPlay: (callback) => ipcRenderer.on('audio-command-play', (event) => callback()),
  onPause: (callback) => ipcRenderer.on('audio-command-pause', (event) => callback()),
  onSetVolume: (callback) => ipcRenderer.on('audio-command-volume', (event, volume) => callback(volume)),
  onChangeStation: (callback) => ipcRenderer.on('audio-command-station', (event, url) => callback(url)),
  sendState: (state) => ipcRenderer.send('audio-state-update', state),
  sendError: (error) => ipcRenderer.send('audio-error', error)
});