const { contextBridge, ipcRenderer } = require('electron');

const callbacks = {
  playback: [],
  stations: [],
  station: [],
  subtitle: [],
  todayFocus: [],
  volume: []
};

ipcRenderer.on('test-playback-status', (_event, payload) => {
  callbacks.playback.forEach((callback) => callback(payload));
});
ipcRenderer.on('test-stations-list', (_event, payload) => {
  callbacks.stations.forEach((callback) => callback(payload));
});
ipcRenderer.on('test-station-changed', (_event, station, index) => {
  callbacks.station.forEach((callback) => callback(station, index));
});
ipcRenderer.on('test-subtitle-changed', (_event, payload) => {
  callbacks.subtitle.forEach((callback) => callback(payload));
});
ipcRenderer.on('test-show-today-focus-changed', (_event, payload) => {
  callbacks.todayFocus.forEach((callback) => callback(payload));
});
ipcRenderer.on('test-volume-changed', (_event, payload) => {
  callbacks.volume.forEach((callback) => callback(payload));
});

contextBridge.exposeInMainWorld('lofiWidget', {
  togglePlayPause: () => ipcRenderer.send('test-widget-command', 'toggle'),
  retryPlayback: () => ipcRenderer.send('test-widget-command', 'retry'),
  setVolume: (volume) => ipcRenderer.send('test-widget-command', 'volume', volume),
  closeApp: () => ipcRenderer.send('test-widget-command', 'close'),
  getStations: () => ipcRenderer.send('test-widget-command', 'stations'),
  changeStation: (index) => ipcRenderer.send('test-widget-command', 'station', index),
  onPlaybackStatusChange: (callback) => callbacks.playback.push(callback),
  onStationsList: (callback) => callbacks.stations.push(callback),
  onStationChanged: (callback) => callbacks.station.push(callback),
  onSubtitleChanged: (callback) => callbacks.subtitle.push(callback),
  getShowTodayFocus: async () => true,
  onShowTodayFocusChanged: (callback) => callbacks.todayFocus.push(callback),
  onVolumeChange: (callback) => callbacks.volume.push(callback)
});

contextBridge.exposeInMainWorld('electronAPI', {
  toggleMiniMode: () => ipcRenderer.send('test-widget-command', 'mini'),
  sendFocusTime: (time) => ipcRenderer.send('test-focus-time', time)
});
