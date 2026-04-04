const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
      setTimeout(() => {
        mainWindow.setAlwaysOnTop(false);
      }, 3000);
    }
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

let mainWindow;
let audioWindow;
let settingsWindow;
let tray;

let stations = [];
let currentStationIndex = 0;
let isPlaying = false;
let currentStationType = 'bilibili';
let currentVolume = 0.3;
let bilibiliPollInterval = null;
let bilibiliVolumeTimeouts = [];
let isMainWindowVisible = true;
let skipUpdateReminder = false;
let shortcuts = {
  playPause: 'Alt+Q',
  toggleWindow: 'Alt+W'
};

let focusTime = 0;

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
      if (data.skipUpdateReminder !== undefined) {
        skipUpdateReminder = data.skipUpdateReminder;
      }
      if (data.volume !== undefined) {
        currentVolume = data.volume;
      }
      return data;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { lastStationIndex: 0, shortcuts, skipUpdateReminder: false };
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

  if (currentStationType === 'bilibili') {
    audioWindow.webContents.executeJavaScript(`
      window.lofiTargetVolume = ${volume};
    `).catch(() => {});
    audioWindow.webContents.executeJavaScript(`
      (function() {
        const videos = document.querySelectorAll('video');
        if (videos.length === 0) {
          return { success: false, reason: 'no_videos' };
        }

        let setCount = 0;
        videos.forEach((video) => {
          try {
            video.volume = ${volume};
            setCount++;
          } catch (e) {
            console.error('Failed to set volume:', e);
          }
        });

        return { success: setCount > 0, count: setCount };
      })();
    `).then((result) => {
      if (result && result.success) {
        mainWindow.webContents.send('volume-changed', volume);
      } else {
        retrySetVolume(volume, 5);
      }
    }).catch(err => {
      console.error('Failed to set volume:', err);
      retrySetVolume(volume, 5);
    });
  } else {
    audioWindow.webContents.send('audio-command-volume', volume);
    mainWindow.webContents.send('volume-changed', volume);
  }
}

function retrySetVolume(volume, maxRetries) {
  let retries = 0;
  const retryInterval = setInterval(() => {
    retries++;

    if (!audioWindow || audioWindow.isDestroyed()) {
      clearInterval(retryInterval);
      return;
    }

    if (currentStationType === 'bilibili') {
      audioWindow.webContents.executeJavaScript(`
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
          videos.forEach(video => {
            video.volume = ${volume};
          });
          return true;
        }
        return false;
      `).then((success) => {
        if (success) {
          clearInterval(retryInterval);
          mainWindow.webContents.send('volume-changed', volume);
        } else if (retries >= maxRetries) {
          clearInterval(retryInterval);
        }
      }).catch(err => {
        if (retries >= maxRetries) {
          clearInterval(retryInterval);
        }
      });
    } else {
      audioWindow.webContents.send('audio-command-volume', volume);
      mainWindow.webContents.send('volume-changed', volume);
      clearInterval(retryInterval);
    }
  }, 1000);
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
      closable: true,
      hasShadow: false,
      roundedCorners: true
    });

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
    if (audioWindow && !audioWindow.isDestroyed()) {
      const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
      const shouldMute = !isCurrentlyMuted;
      
      audioWindow.webContents.setAudioMuted(shouldMute);
      isPlaying = !shouldMute;
      
      console.log(`Audio: ${shouldMute ? 'MUTED' : 'UNMUTED'} via system API`);
      mainWindow.webContents.send('play-state-changed', isPlaying);
    }
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

  ipcMain.on('audio-play-state-changed', (event, playing) => {
    isPlaying = playing;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-state-changed', isPlaying);
    }
  });

  ipcMain.on('audio-volume-changed', (event, volume) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('volume-changed', volume);
    }
  });

  ipcMain.on('audio-error', (event, error) => {
    console.error('Audio Error:', error);
  });

  ipcMain.on('get-stations', (event) => {
    event.reply('stations-list', stations);
    if (stations.length > 0) {
      event.reply('station-changed', stations[currentStationIndex], currentStationIndex);
    }
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createAudioWindow() {
  try {
    const iconPath = getIconPath();

    audioWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      skipTaskbar: true
    });

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
    width: 520,
    height: 400,
    show: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: '设置 - Lofi Radio Player'
  });

  settingsWindow.loadFile('settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
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
    currentStationType = station.type || 'mp3';
    
    saveConfig({ lastStationIndex: currentStationIndex });

    console.log(`Playing station: ${station.name} (type: ${currentStationType})`);

    isPlaying = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-state-changed', true);
    }

    if (currentStationType === 'bilibili') {
      audioWindow.loadURL(station.url).then(() => {
        console.log('Bilibili page loaded');
        initBilibiliAudio();
      }).catch(err => {
        console.error('Failed to load Bilibili page:', err);
      });
    } else {
      if (bilibiliPollInterval) {
        clearInterval(bilibiliPollInterval);
        bilibiliPollInterval = null;
      }
      audioWindow.loadFile('audio.html').then(() => {
        console.log('Audio player loaded');
        setTimeout(() => {
          if (audioWindow && !audioWindow.isDestroyed()) {
            audioWindow.webContents.send('audio-command-station', station.url, station.type);
            audioWindow.webContents.send('audio-command-volume', currentVolume);
          }
        }, 100);
      }).catch(err => {
        console.error('Failed to load audio player:', err);
      });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('station-changed', station, currentStationIndex);
    }
  }
}

function initBilibiliAudio() {
  if (bilibiliPollInterval) {
    clearInterval(bilibiliPollInterval);
    bilibiliPollInterval = null;
  }

  bilibiliVolumeTimeouts.forEach(t => clearTimeout(t));
  bilibiliVolumeTimeouts = [];

  console.log('Audio window: Page loaded, starting polling for video elements');

  audioWindow.webContents.executeJavaScript(`
    window.lofiTargetVolume = ${currentVolume};
    if (window.lofiVolumeObserver) {
      clearInterval(window.lofiVolumeObserver);
    }
    window.lofiVolumeObserver = setInterval(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (Math.abs(video.volume - window.lofiTargetVolume) > 0.01) {
          video.volume = window.lofiTargetVolume;
        }
      });
    }, 500);
    setTimeout(() => {
      clearInterval(window.lofiVolumeObserver);
      window.lofiVolumeObserver = null;
      console.log('Volume observer stopped after 10 seconds');
    }, 10000);
  `);

  bilibiliPollInterval = setInterval(() => {
    audioWindow.webContents.executeJavaScript(`
      const videos = document.querySelectorAll('video');
      if (videos.length > 0) {
        videos.forEach(video => {
          video.muted = true;
          video.volume = ${currentVolume};
        });

        videos[0].play().catch(e => {
          console.log('Auto-play failed, but video is ready');
        });

        console.log('Audio window: Video elements found and initialized (muted)');
        return true;
      }
      return false;
    `).then((found) => {
      if (found) {
        console.log('Audio window: Video initialization complete, clearing poll interval');
        clearInterval(bilibiliPollInterval);
        bilibiliPollInterval = null;
        
        const t1 = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`
            window.lofiTargetVolume = ${currentVolume};
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
              video.volume = ${currentVolume};
            });
          `).then(() => {
            console.log(`Set volume to ${currentVolume} (still muted)`);
          });
        }, 500);
        bilibiliVolumeTimeouts.push(t1);
        
        const t1b = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
              video.muted = false;
            });
          `).then(() => {
            console.log(`Unmuted videos with volume ${currentVolume}`);
          });
        }, 1500);
        bilibiliVolumeTimeouts.push(t1b);
        
        const t2 = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`window.lofiTargetVolume = ${currentVolume}`);
          setApplicationVolume(currentVolume);
        }, 2000);
        bilibiliVolumeTimeouts.push(t2);
        
        const t3 = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`window.lofiTargetVolume = ${currentVolume}`);
          setApplicationVolume(currentVolume);
        }, 3000);
        bilibiliVolumeTimeouts.push(t3);
        
        const t4 = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`window.lofiTargetVolume = ${currentVolume}`);
          setApplicationVolume(currentVolume);
        }, 4000);
        bilibiliVolumeTimeouts.push(t4);
        
        const t5 = setTimeout(() => {
          audioWindow.webContents.executeJavaScript(`window.lofiTargetVolume = ${currentVolume}`);
          setApplicationVolume(currentVolume);
        }, 5000);
        bilibiliVolumeTimeouts.push(t5);
      }
    }).catch(err => {
      console.error('Audio window: Polling error:', err);
      clearInterval(bilibiliPollInterval);
      bilibiliPollInterval = null;
    });
  }, 1000);

  setTimeout(() => {
    if (bilibiliPollInterval) {
      clearInterval(bilibiliPollInterval);
      bilibiliPollInterval = null;
      console.log('Audio window: Polling timeout after 30 seconds');
    }
  }, 30000);
}

let updateWindow = null;

async function checkForUpdates(silent = false) {
  if (silent && skipUpdateReminder) {
    console.log('Update reminder skipped by user preference');
    return;
  }

  try {
    const currentVersion = app.getVersion();
    console.log(`Current version: ${currentVersion}`);

    const response = await fetch('https://api.github.com/repos/labilio/lofi-radio/releases/latest');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const latestVersion = data.tag_name.replace('v', '');
    console.log(`Latest version: ${latestVersion}`);

    if (latestVersion > currentVersion) {
      showUpdateWindow(currentVersion, latestVersion, data.html_url);
    } else if (!silent) {
      showLatestWindow(currentVersion);
    }
  } catch (error) {
    console.error('Check for updates failed:', error);
    if (!silent) {
      await dialog.showMessageBox({
        type: 'error',
        title: '检查更新失败',
        message: '无法检查更新',
        detail: `错误信息: ${error.message}\n\n请手动访问 GitHub 查看更新`,
        buttons: ['打开 GitHub', '取消']
      }).then((result) => {
        if (result.response === 0) {
          shell.openExternal('https://github.com/labilio/lofi-radio/releases');
        }
      });
    }
  }
}

function showUpdateWindow(currentVersion, latestVersion, releaseUrl) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const iconPath = getIconPath();

  updateWindow = new BrowserWindow({
    width: 360,
    height: 360,
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
    width: 360,
    height: 310,
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

ipcMain.on('update-close', () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
});

ipcMain.on('update-skip', () => {
  skipUpdateReminder = true;
  saveConfig({ skipUpdateReminder: true });
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
        if (audioWindow && !audioWindow.isDestroyed()) {
          const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
          audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
          isPlaying = isCurrentlyMuted;
          mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
        }
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

    console.log('Tray created successfully');
  } catch (e) {
    console.log('Tray creation failed, continuing without tray:', e.message);
  }
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll();

  if (shortcuts.playPause) {
    const success = globalShortcut.register(shortcuts.playPause, () => {
      console.log(`${shortcuts.playPause} pressed - toggling mute state`);
      if (audioWindow && !audioWindow.isDestroyed()) {
        const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
        audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
        isPlaying = isCurrentlyMuted;
        console.log(`Global shortcut: Audio ${!isCurrentlyMuted ? 'MUTED' : 'UNMUTED'}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
        }
      }
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
  createAudioWindow();
  createWindow();
  createTray();
  registerGlobalShortcut();

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('volume-changed', currentVolume);
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
  globalShortcut.unregisterAll();
});
