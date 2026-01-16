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