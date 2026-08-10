const { contextBridge, ipcRenderer } = require('electron');

function getSubtitleConfig() {
  return new Promise((resolve) => {
    ipcRenderer.once('subtitle-config-data', (_event, config) => {
      resolve(config);
    });
    ipcRenderer.send('get-subtitle-config');
  });
}

contextBridge.exposeInMainWorld('lofiWidget', {
  togglePlayPause: () => {
    ipcRenderer.send('toggle-play-pause');
  },

  setVolume: (volume) => {
    ipcRenderer.send('set-volume', volume);
  },

  closeApp: () => {
    ipcRenderer.send('close-app');
  },

  onPlayStateChange: (callback) => {
    ipcRenderer.on('play-state-changed', (event, isPlaying) => {
      callback(isPlaying);
    });
  },

  onVolumeChange: (callback) => {
    ipcRenderer.on('volume-changed', (event, volume) => {
      callback(volume);
    });
  },

  getStations: () => ipcRenderer.send('get-stations'),
  
  changeStation: (index) => ipcRenderer.send('change-station', index),

  retryPlayback: () => ipcRenderer.send('retry-playback'),
  
  onStationsList: (callback) => {
    ipcRenderer.on('stations-list', (event, stations) => callback(stations));
  },
  
  onStationChanged: (callback) => {
    ipcRenderer.on('station-changed', (event, station, index) => callback(station, index));
  },

  onPlaybackStatusChange: (callback) => {
    ipcRenderer.on('playback-status-changed', (event, status) => callback(status));
  },

  onSubtitleChanged: (callback) => {
    ipcRenderer.on('subtitle-changed', (event, config) => callback(config));
  },

  getSubtitleConfig,

  getShowTodayFocus: () => ipcRenderer.invoke('get-show-today-focus'),

  onShowTodayFocusChanged: (callback) => {
    ipcRenderer.on('show-today-focus-changed', (event, enabled) => callback(enabled));
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => {
    ipcRenderer.send('close-app');
  },

  toggleMiniMode: () => {
    ipcRenderer.send('toggle-mini-mode');
  },

  sendFocusTime: (time) => {
    ipcRenderer.send('focus-time-update', time);
  }
});

contextBridge.exposeInMainWorld('settingsAPI', {
  getShortcuts: () => {
    ipcRenderer.send('get-shortcuts');
    return new Promise((resolve) => {
      ipcRenderer.once('shortcuts-data', (event, shortcuts) => {
        resolve(shortcuts);
      });
    });
  },
  
  saveShortcuts: (shortcuts) => {
    ipcRenderer.send('save-shortcuts', shortcuts);
    return new Promise((resolve) => {
      ipcRenderer.once('shortcuts-saved', (event, success) => {
        resolve(success);
      });
    });
  },

  onPreventedWindowShortcutInput: (callback) => {
    ipcRenderer.on('prevented-window-shortcut-input', (_event, input) => callback(input));
  },

  closeWindow: () => {
    ipcRenderer.send('close-settings-window');
  },

  setContentHeight: (height) => {
    ipcRenderer.send('set-settings-height', height);
  },

  getLaunchAtStartup: () => ipcRenderer.invoke('get-launch-at-startup'),

  setLaunchAtStartup: (enabled) => ipcRenderer.invoke('set-launch-at-startup', enabled),

  getSubtitleConfig,

  setSubtitleConfig: (config) => {
    ipcRenderer.send('set-subtitle-config', config);
  },

  getShowTodayFocus: () => ipcRenderer.invoke('get-show-today-focus'),

  setShowTodayFocus: (enabled) => ipcRenderer.invoke('set-show-today-focus', enabled)
});

globalThis.addEventListener('online', () => {
  ipcRenderer.send('network-status-changed', true);
});

globalThis.addEventListener('offline', () => {
  ipcRenderer.send('network-status-changed', false);
});

contextBridge.exposeInMainWorld('historyAPI', {
  closeWindow: () => {
    ipcRenderer.send('close-history-window');
  },

  setContentHeight: (height) => {
    ipcRenderer.send('set-history-height', height);
  }
});
