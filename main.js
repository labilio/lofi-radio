const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  checkLatestRelease,
  normalizeVersion,
  shouldSkipUpdateReminder
} = require('./update-service');
const {
  getLaunchAtStartupStatus,
  initializeLaunchAtStartup,
  setLaunchAtStartup
} = require('./startup-service');
const { fitSettingsWindow, showWindowWhenReady } = require('./subpage-window');
const { PlaybackController } = require('./playback-controller');
const { createAudioWindowAdapter } = require('./audio-window-adapters');
const { createAudioWindowWebPreferences } = require('./audio-window-config');
const {
  startAudioOutputMonitoring
} = require('./audio-output-monitor');
const {
  installWindowShortcutPrevention
} = require('./window-shortcut-prevention');

const configPath = path.join(app.getPath('userData'), 'config.json');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    console.log('Second instance detected, focusing main window...');
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        isMainWindowVisible = true;
        updateTrayMenu();
      }
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
    }
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

let mainWindow;
let audioWindow;
let settingsWindow;
let historyWindow;
let tray;

let stations = [];
let currentStationIndex = 0;
let isPlaying = false;
let currentVolume = 0.3;
let playbackController = null;
let activePlaybackAdapter = null;
let disposeAudioOutputMonitoring = () => {};
let playbackStatus = {
  sessionId: 0,
  stationIndex: -1,
  state: 'idle',
  reason: null,
  retryCount: 0
};
let isMainWindowVisible = true;
let skippedUpdateVersion = null;
let shortcuts = {
  playPause: 'Alt+Q',
  toggleWindow: 'Alt+W'
};

let focusTime = 0;

let launchAtStartup = false;

let subtitleMode = 'date';
let subtitleCustomText = '';
let showTodayFocus = true;

let isAnimating = false;

function fadeWindowOut(callback) {
  if (isAnimating || !mainWindow || mainWindow.isDestroyed()) return;
  isAnimating = true;
  
  let opacity = 1;
  const step = 0.1;
  const interval = 16;
  
  const fade = setInterval(() => {
    opacity -= step;
    if (opacity <= 0) {
      clearInterval(fade);
      mainWindow.setOpacity(0);
      mainWindow.hide();
      mainWindow.setOpacity(1);
      isAnimating = false;
      if (callback) callback();
    } else {
      mainWindow.setOpacity(opacity);
    }
  }, interval);
}

function fadeWindowIn(callback) {
  if (isAnimating || !mainWindow || mainWindow.isDestroyed()) return;
  isAnimating = true;
  
  mainWindow.setOpacity(0);
  mainWindow.show();
  
  let opacity = 0;
  const step = 0.1;
  const interval = 16;
  
  const fade = setInterval(() => {
    opacity += step;
    if (opacity >= 1) {
      clearInterval(fade);
      mainWindow.setOpacity(1);
      isAnimating = false;
      if (callback) callback();
    } else {
      mainWindow.setOpacity(opacity);
    }
  }, interval);
}

function toggleMainWindowVisibility() {
  if (isAnimating) return;
  
  if (isMainWindowVisible) {
    fadeWindowOut(() => {
      isMainWindowVisible = false;
      updateTrayMenu();
    });
  } else {
    fadeWindowIn(() => {
      isMainWindowVisible = true;
      updateTrayMenu();
    });
  }
}

function saveConfig(config) {
  try {
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...config };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.shortcuts) {
        shortcuts = { ...shortcuts, ...data.shortcuts };
      }
      if (typeof data.skippedUpdateVersion === 'string') {
        skippedUpdateVersion = data.skippedUpdateVersion;
      }
      if (data.volume !== undefined) {
        currentVolume = data.volume;
      }
      if (data.launchAtStartup !== undefined) {
        launchAtStartup = data.launchAtStartup;
      }
      if (data.subtitleMode !== undefined) {
        subtitleMode = data.subtitleMode;
      }
      if (data.subtitleCustomText !== undefined) {
        subtitleCustomText = data.subtitleCustomText;
      }
      if (typeof data.showTodayFocus === 'boolean') {
        showTodayFocus = data.showTodayFocus;
      }
      return data;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { lastStationIndex: 0, shortcuts, skippedUpdateVersion: null };
}

function getIconPath() {
  const iconFormats = process.platform === 'darwin' 
    ? ['icon.icns', 'icon.png']
    : ['icon.ico', 'icon.png'];
  
  for (const iconFile of iconFormats) {
    const iconPath = path.join(__dirname, iconFile);
    if (fs.existsSync(iconPath)) {
      console.log(`Using icon: ${iconFile}`);
      return iconPath;
    }
  }
  
  console.log('No icon file found, using default icon');
  return null;
}

function setApplicationVolume(volume) {
  currentVolume = volume;
  saveConfig({ volume });
  if (!audioWindow || audioWindow.isDestroyed()) {
    return;
  }

  audioWindow.webContents.send('audio-command-volume', volume);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('volume-changed', volume);
  }
}

function publishPlaybackStatus(status) {
  playbackStatus = status;
  isPlaying = status.state === 'playing';

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('playback-status-changed', status);
    mainWindow.webContents.send('play-state-changed', isPlaying);
  }

  if (tray) {
    updateTrayMenu();
  }
}

function initializePlaybackController() {
  playbackController = new PlaybackController({
    createAdapter(type) {
      activePlaybackAdapter = createAudioWindowAdapter(type, {
        audioWindow,
        getVolume: () => currentVolume
      });
      return activePlaybackAdapter;
    },
    onStateChange: publishPlaybackStatus
  });
}

function togglePlayback() {
  if (!playbackController) return;

  if (playbackStatus.state === 'error') {
    playbackController.retry();
  } else {
    playbackController.togglePaused();
  }
}

function createWindow() {
  try {
    const iconPath = getIconPath();

    mainWindow = new BrowserWindow({
      width: 300,
      height: 150,
      show: true,
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false
      },
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: true,
      hasShadow: false,
      roundedCorners: true
    });
    installWindowShortcutPrevention(mainWindow);

    console.log('Widget window created successfully');
  } catch (e) {
    console.error('Failed to create widget window:', e);
    app.quit();
    return;
  }

  mainWindow.loadFile('index.html');
  console.log('Loading lofi radio widget...');

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const windowWidth = 300;
  const windowHeight = 150;

  const x = Math.floor((width - windowWidth) / 2);
  const y = Math.floor((height - windowHeight) / 2);
  mainWindow.setPosition(x, y);

  console.log(`Widget window positioned at: ${x}, ${y} (screen: ${width}x${height})`);

  ipcMain.on('toggle-play-pause', () => {
    togglePlayback();
  });

  ipcMain.on('retry-playback', () => {
    playbackController?.retry();
  });

  ipcMain.on('set-volume', (event, volume) => {
    setApplicationVolume(volume);
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });

  ipcMain.on('toggle-mini-mode', () => {
    const [currentWidth, currentHeight] = mainWindow.getSize();

    if (currentWidth === 180 && currentHeight === 45) {
      mainWindow.setSize(300, 150);
      console.log('Switched to normal mode');
    } else {
      mainWindow.setSize(180, 45);
      console.log('Switched to mini mode');
    }
  });

  ipcMain.on('audio-state-update', (event, payload) => {
    if (audioWindow &&
        !audioWindow.isDestroyed() &&
        event.sender === audioWindow.webContents) {
      activePlaybackAdapter?.handleState(payload);
    }
  });

  ipcMain.on('audio-volume-changed', (event, volume) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('volume-changed', volume);
    }
  });

  ipcMain.on('network-status-changed', (event, online) => {
    if (mainWindow &&
        !mainWindow.isDestroyed() &&
        event.sender === mainWindow.webContents) {
      playbackController?.setOnline(online);
    }
  });

  ipcMain.on('get-stations', (event) => {
    event.reply('stations-list', stations);
    if (stations.length > 0) {
      event.reply('station-changed', stations[currentStationIndex], currentStationIndex);
    }
    event.reply('playback-status-changed', playbackStatus);
  });

  ipcMain.on('change-station', (event, index) => {
    playStation(index);
  });

  ipcMain.on('get-shortcuts', (event) => {
    event.reply('shortcuts-data', shortcuts);
  });

  ipcMain.on('save-shortcuts', (event, newShortcuts) => {
    shortcuts = { ...shortcuts, ...newShortcuts };
    saveConfig({ shortcuts });
    updateTrayMenu();
    event.reply('shortcuts-saved', true);
    
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 500);
  });

  ipcMain.on('close-settings-window', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  ipcMain.on('set-settings-height', (event, contentHeight) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      fitSettingsWindow(settingsWindow, contentHeight);
    }
  });

  ipcMain.handle('get-launch-at-startup', () => {
    try {
      const status = getLaunchAtStartupStatus(app);
      launchAtStartup = status.enabled;
      return status;
    } catch (error) {
      console.error('Failed to read launch-at-startup state:', error);
      return {
        enabled: launchAtStartup,
        registered: false,
        error: '无法读取 Windows 启动项状态'
      };
    }
  });

  ipcMain.handle('set-launch-at-startup', (_event, enabled) => {
    try {
      const status = setLaunchAtStartup(app, Boolean(enabled));
      launchAtStartup = status.enabled;
      saveConfig({ launchAtStartup });
      // saveConfig() loads the previous file before merging; retain the verified OS state.
      launchAtStartup = status.enabled;
      return status;
    } catch (error) {
      console.error('Failed to update launch-at-startup state:', error);
      return {
        enabled: launchAtStartup,
        registered: false,
        error: 'Windows 启动项设置失败'
      };
    }
  });

  ipcMain.handle('get-show-today-focus', () => showTodayFocus);

  ipcMain.handle('set-show-today-focus', (_event, enabled) => {
    showTodayFocus = Boolean(enabled);
    saveConfig({ showTodayFocus });
    // saveConfig() reloads the existing file before merging; retain the requested value.
    showTodayFocus = Boolean(enabled);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-today-focus-changed', showTodayFocus);
    }
    return showTodayFocus;
  });

  ipcMain.on('get-subtitle-config', (event) => {
    event.reply('subtitle-config-data', { mode: subtitleMode, customText: subtitleCustomText });
  });

  ipcMain.on('set-subtitle-config', (event, config) => {
    if (config.mode !== undefined) subtitleMode = config.mode;
    if (config.customText !== undefined) subtitleCustomText = config.customText;
    saveConfig({ subtitleMode, subtitleCustomText });
    // loadConfig() inside saveConfig() overwrites globals with old file values — restore
    if (config.mode !== undefined) subtitleMode = config.mode;
    if (config.customText !== undefined) subtitleCustomText = config.customText;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subtitle-changed', { mode: subtitleMode, customText: subtitleCustomText });
    }
  });

  ipcMain.on('close-history-window', () => {
    if (historyWindow && !historyWindow.isDestroyed()) {
      historyWindow.close();
    }
  });

  ipcMain.on('set-history-height', (event, contentHeight) => {
    if (historyWindow && !historyWindow.isDestroyed()) {
      const minHeight = 400;
      const maxHeight = 550;
      const height = Math.max(minHeight, Math.min(maxHeight, Math.ceil(contentHeight) + 32));
      historyWindow.setSize(420, height);
      historyWindow.center();
      if (!historyWindow.isVisible()) {
        historyWindow.show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createAudioWindow() {
  try {
    const iconPath = getIconPath();

    audioWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      icon: iconPath,
      webPreferences: createAudioWindowWebPreferences(__dirname),
      skipTaskbar: true
    });
    installWindowShortcutPrevention(audioWindow);

    initializePlaybackController();
    loadStations();

    console.log('Audio window created successfully');
  } catch (e) {
    console.error('Failed to create audio window:', e);
  }
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 560,
    show: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '设置 - Lofi Radio Player'
  });
  installWindowShortcutPrevention(settingsWindow, input => {
    settingsWindow.webContents.send('prevented-window-shortcut-input', {
      key: String(input.key || ''),
      ctrlKey: Boolean(input.control),
      altKey: Boolean(input.alt),
      shiftKey: Boolean(input.shift),
      metaKey: Boolean(input.meta)
    });
  });

  showWindowWhenReady(settingsWindow);
  settingsWindow.loadFile('settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  historyWindow = new BrowserWindow({
    width: 420,
    height: 400,
    show: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '专注历史 - Lofi Radio Player'
  });
  installWindowShortcutPrevention(historyWindow);

  showWindowWhenReady(historyWindow);
  historyWindow.loadFile('history.html');

  historyWindow.on('closed', () => {
    historyWindow = null;
  });
}

function loadStations() {
  try {
    const stationsPath = path.join(__dirname, 'stations.json');
    if (fs.existsSync(stationsPath)) {
      const data = fs.readFileSync(stationsPath, 'utf8');
      stations = JSON.parse(data);
      console.log(`Loaded ${stations.length} stations`);
      
      const config = loadConfig();
      let startIndex = config.lastStationIndex || 0;
      
      if (startIndex < 0 || startIndex >= stations.length) {
        startIndex = 0;
      }

      if (stations.length > 0) {
        playStation(startIndex);
      }
    } else {
      console.error('stations.json not found');
    }
  } catch (e) {
    console.error('Failed to load stations:', e);
  }
}

function playStation(index) {
  if (index >= 0 && index < stations.length) {
    currentStationIndex = index;
    const station = stations[index];
    const stationType = station.type || 'mp3';
    
    saveConfig({ lastStationIndex: currentStationIndex });

    console.log(`Playing station: ${station.name} (type: ${stationType})`);

    playbackController?.load(station, currentStationIndex);
    setApplicationVolume(currentVolume);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('station-changed', station, currentStationIndex);
    }
  }
}

let updateWindow = null;

async function checkForUpdates(silent = false) {
  const currentVersion = app.getVersion();
  console.log(`Current version: ${currentVersion}`);

  let result;
  try {
    result = await checkLatestRelease({ currentVersion });
  } catch (error) {
    console.error('Unexpected update check failure:', error);
    result = {
      status: 'error',
      reason: 'request-failed',
      message: '暂时无法连接更新服务，请稍后重试。'
    };
  }

  if (result.status === 'update-available') {
    console.log(`Latest version: ${result.latestVersion}`);
    if (shouldSkipUpdateReminder({
      silent,
      latestVersion: result.latestVersion,
      skippedUpdateVersion
    })) {
      console.log(`Update reminder skipped for version ${result.latestVersion}`);
      return;
    }
    showUpdateWindow(
      result.currentVersion,
      result.latestVersion,
      result.releaseUrl
    );
  } else if (result.status === 'up-to-date') {
    console.log(`Latest version: ${result.latestVersion}`);
    if (!silent) showLatestWindow(result.currentVersion);
  } else {
    console.warn(`Check for updates unavailable: ${result.reason}`);
    if (!silent) showUpdateErrorWindow(result);
  }
}

function showUpdateErrorWindow(result) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  updateWindow = new BrowserWindow({
    width: 420,
    height: 260,
    show: true,
    icon: iconPath,
    backgroundColor: '#171c31',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'update-preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '检查更新'
  });
  installWindowShortcutPrevention(updateWindow);

  updateWindow.loadFile('update-error.html', {
    query: {
      reason: result.reason || 'request-failed'
    }
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

function showUpdateWindow(currentVersion, latestVersion, releaseUrl) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  updateWindow = new BrowserWindow({
    width: 420,
    height: 260,
    show: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'update-preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '发现新版本'
  });
  installWindowShortcutPrevention(updateWindow);

  updateWindow.loadFile('update.html', {
    query: {
      current: currentVersion,
      latest: latestVersion,
      url: releaseUrl
    }
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

function showLatestWindow(currentVersion) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  updateWindow = new BrowserWindow({
    width: 420,
    height: 260,
    show: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'update-preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '已是最新版本'
  });
  installWindowShortcutPrevention(updateWindow);

  updateWindow.loadFile('update-latest.html', {
    query: {
      current: currentVersion
    }
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

ipcMain.on('update-download', (event, url) => {
  shell.openExternal(url);
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
});

ipcMain.on('update-view-changes', () => {
  shell.openExternal('https://github.com/labilio/lofi-radio/releases');
});

ipcMain.on('update-view-repository', () => {
  shell.openExternal('https://github.com/labilio/lofi-radio');
});

ipcMain.on('update-close', () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
});

ipcMain.on('update-retry', () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    const retryWindow = updateWindow;
    retryWindow.once('closed', () => checkForUpdates(false));
    retryWindow.close();
  } else {
    checkForUpdates(false);
  }
});

ipcMain.on('update-skip', (event, version) => {
  try {
    skippedUpdateVersion = normalizeVersion(version);
    saveConfig({ skippedUpdateVersion });
  } catch (error) {
    console.warn('Ignored invalid skipped update version:', error.message);
  }
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
});

ipcMain.on('focus-time-update', (event, time) => {
  focusTime = time;
  updateTrayMenu();
});

function updateTrayMenu() {
  const playPauseLabel = shortcuts.playPause ? `播放/暂停 (${shortcuts.playPause})` : '播放/暂停';
  const toggleWindowLabel = shortcuts.toggleWindow 
    ? (isMainWindowVisible ? `隐藏主页面 (${shortcuts.toggleWindow})` : `显示主页面 (${shortcuts.toggleWindow})`)
    : (isMainWindowVisible ? '隐藏主页面' : '显示主页面');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Focus : ${focusTime} min`,
      click: () => {}
    },
    { type: 'separator' },
    {
      label: playPauseLabel,
      click: () => {
        togglePlayback();
      }
    },
    {
      label: toggleWindowLabel,
      click: () => {
        toggleMainWindowVisibility();
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        createSettingsWindow();
      }
    },
    {
      label: '专注历史',
      click: () => {
        createHistoryWindow();
      }
    },
    {
      label: '检查更新',
      click: () => {
        checkForUpdates();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Lofi Radio Player${shortcuts.playPause ? ` - ${shortcuts.playPause} 播放/暂停` : ''}`);
}

function createTray() {
  try {
    const iconPath = getIconPath();
    
    if (iconPath) {
      tray = new Tray(iconPath);
      console.log(`Tray icon loaded from: ${iconPath}`);
    } else {
      console.log('Creating default tray icon');
      const defaultIcon = path.join(__dirname, 'icon.png');
      if (fs.existsSync(defaultIcon)) {
        tray = new Tray(defaultIcon);
      } else {
        tray = new Tray(Buffer.alloc(0));
        console.log('Using default system tray icon');
      }
    }

    updateTrayMenu();

    tray.on('click', () => {
      toggleMainWindowVisibility();
    });

    console.log('Tray created successfully');
  } catch (e) {
    console.log('Tray creation failed, continuing without tray:', e.message);
  }
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll();

  if (shortcuts.playPause) {
    const success = globalShortcut.register(shortcuts.playPause, () => {
      console.log(`${shortcuts.playPause} pressed - toggling playback state`);
      togglePlayback();
    });

    if (success) {
      console.log(`Global shortcut ${shortcuts.playPause} registered successfully`);
    } else {
      console.log(`Failed to register global shortcut ${shortcuts.playPause}`);
    }
  }

  if (shortcuts.toggleWindow) {
    const success = globalShortcut.register(shortcuts.toggleWindow, () => {
      console.log(`${shortcuts.toggleWindow} pressed - toggling window visibility`);
      toggleMainWindowVisibility();
    });

    if (success) {
      console.log(`Global shortcut ${shortcuts.toggleWindow} registered successfully`);
    } else {
      console.log(`Failed to register global shortcut ${shortcuts.toggleWindow}`);
    }
  }
}

app.whenReady().then(() => {
  console.log('App is ready, creating windows...');
  try {
    const launchStatus = initializeLaunchAtStartup(app, loadConfig);
    launchAtStartup = launchStatus.enabled;
  } catch (error) {
    console.error('Failed to initialize launch-at-startup state:', error);
    launchAtStartup = Boolean(loadConfig().launchAtStartup);
  }
  createAudioWindow();
  disposeAudioOutputMonitoring = startAudioOutputMonitoring({
    ipcMain,
    getAudioWindow: () => audioWindow,
    getPlaybackState: () => playbackStatus.state,
    getPlaybackController: () => playbackController
  });
  createWindow();
  createTray();
  registerGlobalShortcut();

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('volume-changed', currentVolume);
      mainWindow.webContents.send('subtitle-changed', { mode: subtitleMode, customText: subtitleCustomText });
      mainWindow.webContents.send('show-today-focus-changed', showTodayFocus);
      mainWindow.webContents.send('playback-status-changed', playbackStatus);
    }
  }, 100);

  setTimeout(() => {
    setApplicationVolume(currentVolume);
  }, 1500);

  setTimeout(() => {
    checkForUpdates(true);
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAudioWindow();
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to initialize app:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  disposeAudioOutputMonitoring();
  playbackController?.destroy();
  globalShortcut.unregisterAll();
});
