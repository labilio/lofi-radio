const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { lastStationIndex: 0 };
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
let tray;

let stations = [];
let currentStationIndex = 0;
let isPlaying = false;
let currentStationType = 'bilibili';
let bilibiliPollInterval = null;

function getIconPath() {
  const iconFormats = ['icon.ico', 'icon.png', 'icon-256.png', 'icon-128.png', 'icon-64.png', 'icon-32.png', 'icon-16.png'];
  
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
  if (!audioWindow || audioWindow.isDestroyed()) {
    return;
  }

  if (currentStationType === 'bilibili') {
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

  const isTestMode = process.argv.includes('--test-rounded');

  if (isTestMode) {
    const radiusArg = process.argv.find(arg => arg.startsWith('--radius='));
    const radius = radiusArg ? radiusArg.split('=')[1] : '20px';

    mainWindow.loadFile('test-rounded-window.html');
    console.log(`Loading test rounded window with ${radius} radius...`);

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`window.testRadius = '${radius}';`);
    });
  } else {
    mainWindow.loadFile('index.html');
    console.log('Loading normal lofi radio widget...');
  }

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

  console.log('Audio window: Page loaded, starting polling for video elements');

  bilibiliPollInterval = setInterval(() => {
    audioWindow.webContents.executeJavaScript(`
      const videos = document.querySelectorAll('video');
      if (videos.length > 0) {
        videos.forEach(video => {
          video.muted = false;
          video.volume = 0.3;
        });

        videos[0].play().catch(e => {
          console.log('Auto-play failed, but video is ready');
        });

        console.log('Audio window: Video elements found and initialized');
        return true;
      }
      return false;
    `).then((found) => {
      if (found) {
        console.log('Audio window: Video initialization complete, clearing poll interval');
        clearInterval(bilibiliPollInterval);
        bilibiliPollInterval = null;
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

  const isMac = process.platform === 'darwin';
  const shortcutKey = isMac ? 'Option+Q' : 'Alt+Q';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `播放/暂停 (${shortcutKey})`,
      click: () => {
        if (audioWindow && !audioWindow.isDestroyed()) {
          const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
          audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
          isPlaying = isCurrentlyMuted;
          mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
        }
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

    tray.setToolTip(`Lofi Radio Player - ${shortcutKey} 播放/暂停`);
    tray.setContextMenu(contextMenu);

    console.log('Tray created successfully');
  } catch (e) {
    console.log('Tray creation failed, continuing without tray:', e.message);
  }
}

function registerGlobalShortcut() {
  const isMac = process.platform === 'darwin';
  const shortcutKey = isMac ? 'Option+Q' : 'Alt+Q';

  const success = globalShortcut.register(shortcutKey, () => {
    console.log(`${shortcutKey} pressed - toggling mute state`);
    if (audioWindow && !audioWindow.isDestroyed()) {
      const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
      audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
      isPlaying = isCurrentlyMuted;
      console.log(`Global shortcut: Audio ${!isCurrentlyMuted ? 'MUTED' : 'UNMUTED'}`);
      mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
    }
  });

  if (success) {
    console.log(`Global shortcut ${shortcutKey} registered successfully`);
  } else {
    console.log(`Failed to register global shortcut ${shortcutKey}`);
  }
}

app.whenReady().then(() => {
  console.log('App is ready, creating windows...');
  createAudioWindow();
  createWindow();
  createTray();
  registerGlobalShortcut();

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
